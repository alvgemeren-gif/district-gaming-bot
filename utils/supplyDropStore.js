const { Pool } = require('pg');

const pool = process.env.DATABASE_URL
	? new Pool({
		connectionString: process.env.DATABASE_URL,
		ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
	})
	: null;
let schemaPromise;

function requireDatabase() {
	if (!pool) throw new Error('DATABASE_URL is not configured.');
	if (!schemaPromise) {
		schemaPromise = pool.query(`
			CREATE TABLE IF NOT EXISTS supply_drops (
				id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
				message_id TEXT, rarity TEXT NOT NULL CHECK (rarity IN ('common','rare','epic','legendary','mythic')),
				xp INTEGER NOT NULL CHECK (xp > 0), district_points INTEGER NOT NULL CHECK (district_points > 0),
				role_id TEXT NOT NULL, role_duration_minutes INTEGER NOT NULL CHECK (role_duration_minutes > 0),
				created_by TEXT NOT NULL, claimed_by TEXT, district_role_id TEXT,
				claimed_at TIMESTAMPTZ, role_expires_at TIMESTAMPTZ,
				role_removed_at TIMESTAMPTZ,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
			ALTER TABLE supply_drops ADD COLUMN IF NOT EXISTS role_removed_at TIMESTAMPTZ;
			ALTER TABLE supply_drops ADD COLUMN IF NOT EXISTS reward_type TEXT NOT NULL DEFAULT 'rewards';
			ALTER TABLE supply_drops ADD COLUMN IF NOT EXISTS keys INTEGER NOT NULL DEFAULT 0;
			CREATE TABLE IF NOT EXISTS supply_drop_claims (
				drop_id BIGINT PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
				district_role_id TEXT NOT NULL, points INTEGER NOT NULL CHECK (points > 0),
				claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
			CREATE INDEX IF NOT EXISTS supply_drop_claims_score
				ON supply_drop_claims (guild_id, claimed_at, district_role_id);
			CREATE TABLE IF NOT EXISTS district_key_balances (
				guild_id TEXT NOT NULL, district_role_id TEXT NOT NULL,
				keys INTEGER NOT NULL DEFAULT 0 CHECK (keys >= 0),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				PRIMARY KEY (guild_id, district_role_id)
			);
			CREATE TABLE IF NOT EXISTS vault_openings (
				id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, district_role_id TEXT NOT NULL,
				opened_by TEXT NOT NULL, keys_spent INTEGER NOT NULL,
				points INTEGER NOT NULL CHECK (points > 0),
				opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
		`);
	}
	return schemaPromise;
}

async function createDrop(input) {
	await requireDatabase();
	const result = await pool.query(
		`INSERT INTO supply_drops
		 (guild_id,channel_id,rarity,xp,district_points,role_id,role_duration_minutes,created_by,reward_type,keys)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
		[
			input.guildId, input.channelId, input.rarity, input.xp, input.points,
			input.roleId, input.durationMinutes, input.createdBy, input.rewardType, input.keys,
		]
	);
	return result.rows[0];
}

async function setDropMessage(dropId, messageId) {
	await requireDatabase();
	await pool.query('UPDATE supply_drops SET message_id=$2 WHERE id=$1', [dropId, messageId]);
}

async function claimDrop(dropId, guildId, userId, districtRoleId) {
	await requireDatabase();
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const result = await client.query(
			`UPDATE supply_drops SET claimed_by=$3,district_role_id=$4,claimed_at=NOW(),
			 role_expires_at=CASE WHEN reward_type='rewards'
			   THEN NOW()+role_duration_minutes*INTERVAL '1 minute' ELSE NULL END
			 WHERE id=$1 AND guild_id=$2 AND claimed_by IS NULL RETURNING *`,
			[dropId, guildId, userId, districtRoleId]
		);
		if (!result.rows[0]) {
			await client.query('ROLLBACK');
			return null;
		}
		const drop = result.rows[0];
		if (drop.reward_type === 'keys') {
			await client.query(
				`INSERT INTO district_key_balances (guild_id,district_role_id,keys)
				 VALUES ($1,$2,$3)
				 ON CONFLICT (guild_id,district_role_id) DO UPDATE
				 SET keys=district_key_balances.keys+EXCLUDED.keys,updated_at=NOW()`,
				[guildId, districtRoleId, drop.keys]
			);
		} else {
			await client.query(
				`INSERT INTO supply_drop_claims (drop_id,guild_id,user_id,district_role_id,points)
				 VALUES ($1,$2,$3,$4,$5)`,
				[drop.id, guildId, userId, districtRoleId, drop.district_points]
			);
		}
		await client.query('COMMIT');
		return drop;
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

async function getActiveTemporaryRoles() {
	await requireDatabase();
	const result = await pool.query(
		`SELECT id,guild_id,claimed_by,role_id,role_expires_at FROM supply_drops
		 WHERE claimed_by IS NOT NULL AND role_expires_at IS NOT NULL AND role_removed_at IS NULL`
	);
	return result.rows;
}

async function expireTemporaryRole(dropId) {
	await requireDatabase();
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const result = await client.query(
			`UPDATE supply_drops SET role_removed_at=NOW()
			 WHERE id=$1 AND role_removed_at IS NULL AND role_expires_at <= NOW()
			 RETURNING guild_id,claimed_by,role_id`,
			[dropId]
		);
		if (!result.rows[0]) {
			await client.query('ROLLBACK');
			return null;
		}
		const item = result.rows[0];
		const active = await client.query(
			`SELECT 1 FROM supply_drops
			 WHERE guild_id=$1 AND claimed_by=$2 AND role_id=$3
			   AND role_removed_at IS NULL AND role_expires_at > NOW() LIMIT 1`,
			[item.guild_id, item.claimed_by, item.role_id]
		);
		await client.query('COMMIT');
		return { ...item, shouldRemove: active.rowCount === 0 };
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

async function getKeyBalance(guildId, districtRoleId) {
	await requireDatabase();
	const result = await pool.query(
		'SELECT keys FROM district_key_balances WHERE guild_id=$1 AND district_role_id=$2',
		[guildId, districtRoleId]
	);
	return Number(result.rows[0]?.keys) || 0;
}

async function openVault(guildId, districtRoleId, userId, keysRequired, points) {
	await requireDatabase();
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const balance = await client.query(
			`UPDATE district_key_balances SET keys=keys-$3,updated_at=NOW()
			 WHERE guild_id=$1 AND district_role_id=$2 AND keys >= $3 RETURNING keys`,
			[guildId, districtRoleId, keysRequired]
		);
		if (!balance.rows[0]) {
			await client.query('ROLLBACK');
			return null;
		}
		const opening = await client.query(
			`INSERT INTO vault_openings (guild_id,district_role_id,opened_by,keys_spent,points)
			 VALUES ($1,$2,$3,$4,$5) RETURNING *`,
			[guildId, districtRoleId, userId, keysRequired, points]
		);
		await client.query('COMMIT');
		return { ...opening.rows[0], remainingKeys: Number(balance.rows[0].keys) };
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

module.exports = {
	claimDrop, createDrop, expireTemporaryRole, getActiveTemporaryRoles,
	getKeyBalance, openVault, setDropMessage,
};
