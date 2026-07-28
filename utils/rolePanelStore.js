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
			CREATE TABLE IF NOT EXISTS role_panels (
				id BIGSERIAL PRIMARY KEY,
				guild_id TEXT NOT NULL,
				channel_id TEXT NOT NULL,
				message_id TEXT,
				title TEXT NOT NULL,
				description TEXT,
				color INTEGER NOT NULL,
				role_ids TEXT[] NOT NULL,
				created_by TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
			CREATE INDEX IF NOT EXISTS role_panels_guild ON role_panels (guild_id);
		`);
	}
	return schemaPromise;
}

async function createRolePanel(input) {
	await requireDatabase();
	const result = await pool.query(
		`INSERT INTO role_panels
		 (guild_id,channel_id,title,description,color,role_ids,created_by)
		 VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
		[
			input.guildId, input.channelId, input.title, input.description,
			input.color, input.roleIds, input.createdBy,
		]
	);
	return result.rows[0];
}

async function setRolePanelMessage(panelId, messageId) {
	await requireDatabase();
	await pool.query('UPDATE role_panels SET message_id=$2 WHERE id=$1', [panelId, messageId]);
}

async function getRolePanel(panelId, guildId) {
	await requireDatabase();
	const result = await pool.query(
		'SELECT * FROM role_panels WHERE id=$1 AND guild_id=$2',
		[panelId, guildId]
	);
	return result.rows[0] || null;
}

module.exports = { createRolePanel, getRolePanel, setRolePanelMessage };
