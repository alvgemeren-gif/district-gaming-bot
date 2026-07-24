const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const pool = connectionString
	? new Pool({
		connectionString,
		ssl: process.env.DATABASE_SSL === 'false'
			? false
			: { rejectUnauthorized: false },
	})
	: null;

let schemaPromise;

function requireDatabase() {
	if (!pool) {
		throw new Error('DATABASE_URL is not configured.');
	}

	if (!schemaPromise) {
		schemaPromise = pool.query(`
			CREATE TABLE IF NOT EXISTS role_choice_config (
				guild_id TEXT PRIMARY KEY,
				role_ids TEXT[] NOT NULL CHECK (cardinality(role_ids) = 5),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS role_choices (
				guild_id TEXT NOT NULL,
				user_id TEXT NOT NULL,
				role_id TEXT NOT NULL,
				chosen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				PRIMARY KEY (guild_id, user_id)
			);
		`);
	}

	return schemaPromise;
}

async function getRoleConfig(guildId) {
	await requireDatabase();
	const result = await pool.query(
		'SELECT role_ids FROM role_choice_config WHERE guild_id = $1',
		[guildId]
	);
	return result.rows[0]?.role_ids || null;
}

async function setRoleConfig(guildId, roleIds) {
	await requireDatabase();
	await pool.query(
		`INSERT INTO role_choice_config (guild_id, role_ids)
		 VALUES ($1, $2)
		 ON CONFLICT (guild_id) DO UPDATE
		 SET role_ids = EXCLUDED.role_ids, updated_at = NOW()`,
		[guildId, roleIds]
	);
}

async function countChoices(guildId) {
	await requireDatabase();
	const result = await pool.query(
		'SELECT COUNT(*)::INTEGER AS count FROM role_choices WHERE guild_id = $1',
		[guildId]
	);
	return result.rows[0].count;
}

async function getRoleChoice(guildId, userId) {
	await requireDatabase();
	const result = await pool.query(
		'SELECT role_id, chosen_at FROM role_choices WHERE guild_id = $1 AND user_id = $2',
		[guildId, userId]
	);
	return result.rows[0] || null;
}

async function claimRole(guildId, userId, roleId) {
	await requireDatabase();
	const result = await pool.query(
		`INSERT INTO role_choices (guild_id, user_id, role_id)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (guild_id, user_id) DO NOTHING
		 RETURNING role_id, chosen_at`,
		[guildId, userId, roleId]
	);

	if (result.rows[0]) {
		return { created: true, choice: result.rows[0] };
	}

	return {
		created: false,
		choice: await getRoleChoice(guildId, userId),
	};
}

async function rollbackClaim(guildId, userId, roleId) {
	await requireDatabase();
	await pool.query(
		'DELETE FROM role_choices WHERE guild_id = $1 AND user_id = $2 AND role_id = $3',
		[guildId, userId, roleId]
	);
}

async function resetRoleChoice(guildId, userId) {
	await requireDatabase();
	const result = await pool.query(
		'DELETE FROM role_choices WHERE guild_id = $1 AND user_id = $2 RETURNING role_id',
		[guildId, userId]
	);
	return result.rows[0] || null;
}

module.exports = {
	claimRole,
	countChoices,
	getRoleChoice,
	getRoleConfig,
	resetRoleChoice,
	rollbackClaim,
	setRoleConfig,
};
