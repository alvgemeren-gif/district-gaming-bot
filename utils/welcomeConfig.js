const { pool, requireDatabase } = require('./scoreStore');

let schemaPromise;

async function ensureSchema() {
	await requireDatabase();

	if (!schemaPromise) {
		schemaPromise = pool.query(`
			CREATE TABLE IF NOT EXISTS welcome_configs (
				guild_id TEXT PRIMARY KEY,
				channel_id TEXT NOT NULL,
				message TEXT NOT NULL,
				enabled BOOLEAN NOT NULL DEFAULT TRUE,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
		`);
	}

	return schemaPromise;
}

async function getWelcomeConfig(guildId) {
	await ensureSchema();
	const result = await pool.query(
		`SELECT channel_id, message
		 FROM welcome_configs
		 WHERE guild_id = $1 AND enabled = TRUE`,
		[guildId]
	);

	if (!result.rows[0]) {
		return null;
	}

	return {
		channelId: result.rows[0].channel_id,
		message: result.rows[0].message,
	};
}

async function setWelcomeConfig(guildId, config) {
	await ensureSchema();
	await pool.query(
		`INSERT INTO welcome_configs (guild_id, channel_id, message, enabled)
		 VALUES ($1, $2, $3, TRUE)
		 ON CONFLICT (guild_id) DO UPDATE
		 SET channel_id = EXCLUDED.channel_id,
		     message = EXCLUDED.message,
		     enabled = TRUE,
		     updated_at = NOW()`,
		[guildId, config.channelId, config.message]
	);
}

async function deleteWelcomeConfig(guildId) {
	await ensureSchema();
	await pool.query(
		`UPDATE welcome_configs
		 SET enabled = FALSE, updated_at = NOW()
		 WHERE guild_id = $1`,
		[guildId]
	);
}

function formatWelcomeMessage(template, member) {
	return template
		.replaceAll('\\n', '\n')
		.replaceAll('{user}', `${member}`)
		.replaceAll('{username}', member.user.username)
		.replaceAll('{server}', member.guild.name)
		.replaceAll('{membercount}', `${member.guild.memberCount}`);
}

module.exports = {
	deleteWelcomeConfig,
	formatWelcomeMessage,
	getWelcomeConfig,
	setWelcomeConfig,
};
