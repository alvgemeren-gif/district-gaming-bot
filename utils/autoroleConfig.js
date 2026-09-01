const { pool, requireDatabase } = require('./scoreStore');

let schemaPromise;

async function ensureSchema() {
	await requireDatabase();

	if (!schemaPromise) {
		schemaPromise = pool.query(`
			CREATE TABLE IF NOT EXISTS autorole_configs (
				guild_id TEXT PRIMARY KEY,
				role_ids TEXT[] NOT NULL,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
		`);
	}

	return schemaPromise;
}

async function getAutoroleConfig(guildId) {
	await ensureSchema();
	const result = await pool.query(
		'SELECT role_ids FROM autorole_configs WHERE guild_id = $1',
		[guildId]
	);
	return { roleIds: result.rows[0]?.role_ids || [] };
}

async function setAutoroleConfig(guildId, roleIds) {
	await ensureSchema();
	await pool.query(
		`INSERT INTO autorole_configs (guild_id, role_ids)
		 VALUES ($1, $2)
		 ON CONFLICT (guild_id) DO UPDATE
		 SET role_ids = EXCLUDED.role_ids, updated_at = NOW()`,
		[guildId, roleIds]
	);
}

async function deleteAutoroleConfig(guildId) {
	await ensureSchema();
	await pool.query('DELETE FROM autorole_configs WHERE guild_id = $1', [guildId]);
}

module.exports = {
	deleteAutoroleConfig,
	getAutoroleConfig,
	setAutoroleConfig,
};
