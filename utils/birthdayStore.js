const { pool, requireDatabase } = require('./scoreStore');

let schemaPromise;

async function ensureSchema() {
	await requireDatabase();
	if (!schemaPromise) {
		schemaPromise = pool.query(`
			CREATE TABLE IF NOT EXISTS birthdays (
				guild_id TEXT NOT NULL,
				user_id TEXT NOT NULL,
				birth_day INTEGER NOT NULL CHECK (birth_day BETWEEN 1 AND 31),
				birth_month INTEGER NOT NULL CHECK (birth_month BETWEEN 1 AND 12),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				PRIMARY KEY (guild_id, user_id)
			);
			CREATE TABLE IF NOT EXISTS birthday_configs (
				guild_id TEXT PRIMARY KEY,
				channel_id TEXT NOT NULL,
				role_id TEXT,
				enabled BOOLEAN NOT NULL DEFAULT TRUE,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
			CREATE TABLE IF NOT EXISTS birthday_announcements (
				guild_id TEXT NOT NULL,
				user_id TEXT NOT NULL,
				birthday_year INTEGER NOT NULL,
				announced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				PRIMARY KEY (guild_id, user_id, birthday_year)
			);
		`);
	}
	return schemaPromise;
}

async function setBirthday(guildId, userId, day, month) {
	await ensureSchema();
	await pool.query(`INSERT INTO birthdays (guild_id, user_id, birth_day, birth_month)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (guild_id, user_id) DO UPDATE SET
		birth_day = EXCLUDED.birth_day, birth_month = EXCLUDED.birth_month, updated_at = NOW()`,
	[guildId, userId, day, month]);
}

async function removeBirthday(guildId, userId) {
	await ensureSchema();
	const result = await pool.query('DELETE FROM birthdays WHERE guild_id = $1 AND user_id = $2', [guildId, userId]);
	return result.rowCount > 0;
}

async function getBirthday(guildId, userId) {
	await ensureSchema();
	const result = await pool.query('SELECT birth_day, birth_month FROM birthdays WHERE guild_id = $1 AND user_id = $2', [guildId, userId]);
	return result.rows[0] || null;
}

async function listBirthdays(guildId) {
	await ensureSchema();
	const result = await pool.query('SELECT user_id, birth_day, birth_month FROM birthdays WHERE guild_id = $1', [guildId]);
	return result.rows;
}

async function setBirthdayConfig(guildId, channelId, roleId) {
	await ensureSchema();
	await pool.query(`INSERT INTO birthday_configs (guild_id, channel_id, role_id, enabled)
		VALUES ($1, $2, $3, TRUE)
		ON CONFLICT (guild_id) DO UPDATE SET channel_id = EXCLUDED.channel_id,
		role_id = EXCLUDED.role_id, enabled = TRUE, updated_at = NOW()`, [guildId, channelId, roleId]);
}

async function getBirthdayConfig(guildId, includeDisabled = false) {
	await ensureSchema();
	const result = await pool.query(`SELECT channel_id, role_id, enabled FROM birthday_configs
		WHERE guild_id = $1${includeDisabled ? '' : ' AND enabled = TRUE'}`, [guildId]);
	if (!result.rows[0]) return null;
	return { channelId: result.rows[0].channel_id, roleId: result.rows[0].role_id, enabled: result.rows[0].enabled };
}

async function disableBirthdayConfig(guildId) {
	await ensureSchema();
	const result = await pool.query('UPDATE birthday_configs SET enabled = FALSE, updated_at = NOW() WHERE guild_id = $1', [guildId]);
	return result.rowCount > 0;
}

async function claimAnnouncement(guildId, userId, year) {
	await ensureSchema();
	const result = await pool.query(`INSERT INTO birthday_announcements (guild_id, user_id, birthday_year)
		VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING user_id`, [guildId, userId, year]);
	return result.rowCount > 0;
}

async function releaseAnnouncement(guildId, userId, year) {
	await ensureSchema();
	await pool.query('DELETE FROM birthday_announcements WHERE guild_id = $1 AND user_id = $2 AND birthday_year = $3', [guildId, userId, year]);
}

module.exports = { claimAnnouncement, disableBirthdayConfig, getBirthday, getBirthdayConfig, listBirthdays, releaseAnnouncement, removeBirthday, setBirthday, setBirthdayConfig };
