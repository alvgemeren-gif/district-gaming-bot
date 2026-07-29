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
			CREATE TABLE IF NOT EXISTS supply_drop_config (
				guild_id TEXT PRIMARY KEY,
				channel_id TEXT NOT NULL,
				role_id TEXT NOT NULL,
				interval_minutes INTEGER NOT NULL CHECK (interval_minutes >= 60),
				enabled BOOLEAN NOT NULL DEFAULT TRUE,
				next_drop_at TIMESTAMPTZ NOT NULL,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
			ALTER TABLE supply_drop_config ADD COLUMN IF NOT EXISTS channel_ids TEXT[] NOT NULL DEFAULT '{}';
			ALTER TABLE supply_drop_config ADD COLUMN IF NOT EXISTS trigger_message_count INTEGER NOT NULL DEFAULT 100;
			ALTER TABLE supply_drop_config ADD COLUMN IF NOT EXISTS current_message_count INTEGER NOT NULL DEFAULT 0;
			CREATE TABLE IF NOT EXISTS supply_drop_messages (
				drop_id BIGINT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT NOT NULL,
				PRIMARY KEY (drop_id, channel_id)
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

async function addDropMessage(dropId, channelId, messageId) {
	await requireDatabase();
	await pool.query(
		`INSERT INTO supply_drop_messages (drop_id,channel_id,message_id)
		 VALUES ($1,$2,$3) ON CONFLICT (drop_id,channel_id) DO UPDATE SET message_id=EXCLUDED.message_id`,
		[dropId, channelId, messageId]
	);
}

async function getDropMessages(dropId) {
	await requireDatabase();
	const result = await pool.query(
		'SELECT channel_id,message_id FROM supply_drop_messages WHERE drop_id=$1',
		[dropId]
	);
	return result.rows;
}

async function claimDrop(dropId, guildId, userId, districtRoleId) {
	await requireDatabase();
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const result = await client.query(
			`UPDATE supply_drops SET claimed_by=$3,district_role_id=$4,claimed_at=NOW(),
			 reward_type=CASE WHEN reward_type='rewards' THEN 'xp' ELSE reward_type END,
			 role_expires_at=CASE
			   WHEN reward_type='role' THEN NOW()+role_duration_minutes*INTERVAL '1 minute'
			   ELSE NULL
			 END
			 WHERE id=$1 AND guild_id=$2 AND claimed_by IS NULL RETURNING *`,
			[dropId, guildId, userId, districtRoleId]
		);
		if (!result.rows[0]) {
			await client.query('ROLLBACK');
			return null;
		}
		const drop = result.rows[0];
		if (drop.reward_type === 'points') {
			await client.query(
				`INSERT INTO supply_drop_claims (drop_id,guild_id,user_id,district_role_id,points)
				 VALUES ($1,$2,$3,$4,$5)`,
				[drop.id, guildId, userId, districtRoleId, drop.district_points]
			);
		}
		if (drop.reward_type === 'keys') {
			await client.query(
				`INSERT INTO district_key_balances (guild_id,district_role_id,keys)
				 VALUES ($1,$2,$3)
				 ON CONFLICT (guild_id,district_role_id) DO UPDATE
				 SET keys=district_key_balances.keys+EXCLUDED.keys,updated_at=NOW()`,
				[guildId, districtRoleId, drop.keys]
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

async function setAutomaticDropConfig(guildId, channelId, roleId, intervalMinutes) {
	await requireDatabase();
	const result = await pool.query(
		`INSERT INTO supply_drop_config
		 (guild_id,channel_id,role_id,interval_minutes,enabled,next_drop_at)
		 VALUES ($1,$2,$3,$4,TRUE,NOW()+$4*INTERVAL '1 minute')
		 ON CONFLICT (guild_id) DO UPDATE SET
		   channel_id=EXCLUDED.channel_id,role_id=EXCLUDED.role_id,
		   interval_minutes=EXCLUDED.interval_minutes,enabled=TRUE,
		   next_drop_at=EXCLUDED.next_drop_at,updated_at=NOW()
		 RETURNING *`,
		[guildId, channelId, roleId, intervalMinutes]
	);
	return result.rows[0];
}

async function setMessageDropConfig(guildId, channelIds, roleId, messageCount) {
	await requireDatabase();
	const result = await pool.query(
		`INSERT INTO supply_drop_config
		 (guild_id,channel_id,role_id,interval_minutes,enabled,next_drop_at,
		  channel_ids,trigger_message_count,current_message_count)
		 VALUES ($1,$2,$3,60,TRUE,NOW()+INTERVAL '100 years',$4,$5,0)
		 ON CONFLICT (guild_id) DO UPDATE SET
		   channel_id=EXCLUDED.channel_id,channel_ids=EXCLUDED.channel_ids,role_id=EXCLUDED.role_id,
		   trigger_message_count=EXCLUDED.trigger_message_count,current_message_count=0,
		   enabled=TRUE,next_drop_at=EXCLUDED.next_drop_at,updated_at=NOW()
		 RETURNING *`,
		[guildId, channelIds[0], roleId, channelIds, messageCount]
	);
	return result.rows[0];
}

async function countXpMessage(guildId, channelId) {
	await requireDatabase();
	const result = await pool.query(
		`UPDATE supply_drop_config SET
		   current_message_count=(current_message_count+1)%trigger_message_count,updated_at=NOW()
		 WHERE guild_id=$1 AND enabled=TRUE AND $2=ANY(channel_ids)
		 RETURNING *, current_message_count=0 AS triggered`,
		[guildId, channelId]
	);
	return result.rows[0]?.triggered ? result.rows[0] : null;
}

async function disableAutomaticDrops(guildId) {
	await requireDatabase();
	const result = await pool.query(
		'UPDATE supply_drop_config SET enabled=FALSE,updated_at=NOW() WHERE guild_id=$1 RETURNING guild_id',
		[guildId]
	);
	return Boolean(result.rows[0]);
}

async function claimDueAutomaticDrops() {
	await requireDatabase();
	const result = await pool.query(
		`UPDATE supply_drop_config SET
		   next_drop_at=NOW()+interval_minutes*INTERVAL '1 minute',updated_at=NOW()
		 WHERE enabled=TRUE AND next_drop_at <= NOW()
		 RETURNING *`
	);
	return result.rows;
}

module.exports = {
	addDropMessage, claimDrop, claimDueAutomaticDrops, countXpMessage, createDrop,
	disableAutomaticDrops, expireTemporaryRole, getActiveTemporaryRoles,
	getDropMessages, getKeyBalance, openVault, setAutomaticDropConfig,
	setDropMessage, setMessageDropConfig,
};
