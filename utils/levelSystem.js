const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const LEGACY_PATH = path.join(__dirname, '..', 'data', 'levels.json');
const XP_PER_MESSAGE = 15;
const XP_COOLDOWN_MS = 60000;
const XP_PER_VOICE_INTERVAL = 10;
const VOICE_XP_INTERVAL_MS = 5 * 60 * 1000;
const cooldowns = new Map();
const pool = process.env.DATABASE_URL ? new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
}) : null;
let schemaPromise;

function requireDatabase() {
	if (!pool) throw new Error('DATABASE_URL is not configured.');
	return schemaPromise ||= initializeDatabase();
}

async function initializeDatabase() {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS level_users (
			guild_id TEXT NOT NULL, user_id TEXT NOT NULL, xp BIGINT NOT NULL DEFAULT 0 CHECK (xp >= 0),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (guild_id, user_id));
		CREATE TABLE IF NOT EXISTS level_rewards (
			guild_id TEXT NOT NULL, level INTEGER NOT NULL CHECK (level > 0), role_id TEXT NOT NULL,
			PRIMARY KEY (guild_id, level, role_id));
		CREATE TABLE IF NOT EXISTS level_settings (
			guild_id TEXT PRIMARY KEY, announcement_channel_id TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
		CREATE TABLE IF NOT EXISTS level_migrations (
			migration_key TEXT PRIMARY KEY, completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
	`);
	if (!fs.existsSync(LEGACY_PATH)) return;
	let legacy;
	try { legacy = JSON.parse(fs.readFileSync(LEGACY_PATH, 'utf8')); }
	catch (error) { console.error('Failed to read legacy level data:', error); return; }
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const marker = await client.query(
			`INSERT INTO level_migrations (migration_key) VALUES ('levels-json-v1') ON CONFLICT DO NOTHING RETURNING migration_key`
		);
		if (marker.rowCount) {
			for (const [guildId, guild] of Object.entries(legacy.guilds || {})) {
				for (const [userId, user] of Object.entries(guild.users || {})) {
					await client.query(
						`INSERT INTO level_users (guild_id, user_id, xp) VALUES ($1,$2,$3)
						 ON CONFLICT (guild_id,user_id) DO UPDATE SET xp=GREATEST(level_users.xp,EXCLUDED.xp)`,
						[guildId, userId, Math.max(0, Number(user.xp) || 0)]);
				}
				for (const [level, roles] of Object.entries(guild.rewards || {})) {
					for (const roleId of new Set(roles)) await client.query(
						'INSERT INTO level_rewards (guild_id,level,role_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
						[guildId, Number(level), roleId]);
				}
				if (guild.announcementChannelId) await client.query(
					'INSERT INTO level_settings (guild_id,announcement_channel_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
					[guildId, guild.announcementChannelId]);
			}
		}
		await client.query('COMMIT');
	} catch (error) { await client.query('ROLLBACK'); throw error; }
	finally { client.release(); }
}

function xpForLevel(level) { return level * level * 100; }
function levelFromXp(xp) {
	let level = 0;
	while (xp >= xpForLevel(level + 1)) level++;
	return level;
}

async function getLevelRewards(guildId) {
	await requireDatabase();
	const { rows } = await pool.query('SELECT level,role_id FROM level_rewards WHERE guild_id=$1 ORDER BY level', [guildId]);
	return rows.reduce((result, row) => { (result[row.level] ||= []).push(row.role_id); return result; }, {});
}
async function getLevelSettings(guildId) {
	await requireDatabase();
	const { rows } = await pool.query('SELECT announcement_channel_id FROM level_settings WHERE guild_id=$1', [guildId]);
	return { announcementChannelId: rows[0]?.announcement_channel_id || null };
}
async function setLevelAnnouncementChannel(guildId, channelId) {
	await requireDatabase();
	await pool.query(`INSERT INTO level_settings (guild_id,announcement_channel_id) VALUES ($1,$2)
		ON CONFLICT (guild_id) DO UPDATE SET announcement_channel_id=EXCLUDED.announcement_channel_id,updated_at=NOW()`, [guildId, channelId]);
}
async function deleteLevelAnnouncementChannel(guildId) { await setLevelAnnouncementChannel(guildId, null); }
async function setLevelReward(guildId, level, roleIds) {
	await requireDatabase();
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		await client.query('DELETE FROM level_rewards WHERE guild_id=$1 AND level=$2', [guildId, level]);
		for (const roleId of new Set(roleIds)) await client.query(
			'INSERT INTO level_rewards (guild_id,level,role_id) VALUES ($1,$2,$3)', [guildId, level, roleId]);
		await client.query('COMMIT');
	} catch (error) { await client.query('ROLLBACK'); throw error; }
	finally { client.release(); }
}
async function addLevelReward(guildId, level, roleId) {
	await requireDatabase();
	await pool.query('INSERT INTO level_rewards (guild_id,level,role_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [guildId, level, roleId]);
}
async function deleteLevelReward(guildId, level, roleId = null) {
	await requireDatabase();
	if (roleId) await pool.query('DELETE FROM level_rewards WHERE guild_id=$1 AND level=$2 AND role_id=$3', [guildId, level, roleId]);
	else await pool.query('DELETE FROM level_rewards WHERE guild_id=$1 AND level=$2', [guildId, level]);
}
function formatLevelData(xp) {
	const level = levelFromXp(xp);
	return { xp, level, currentLevelXp: xpForLevel(level), nextLevelXp: xpForLevel(level + 1) };
}
async function getUserLevel(guildId, userId) {
	await requireDatabase();
	const { rows } = await pool.query('SELECT xp FROM level_users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
	return formatLevelData(Number(rows[0]?.xp || 0));
}
async function getLevelLeaderboard(guildId, limit = 10) {
	await requireDatabase();
	const { rows } = await pool.query(
		'SELECT user_id,xp FROM level_users WHERE guild_id=$1 ORDER BY xp DESC,user_id ASC LIMIT $2',
		[guildId, Math.max(1, limit)]);
	return rows.map(row => ({ userId: row.user_id, xp: Number(row.xp), level: levelFromXp(Number(row.xp)) }));
}
async function getUserRank(guildId, userId) {
	await requireDatabase();
	const { rows } = await pool.query(`SELECT position,total FROM (
		SELECT user_id,ROW_NUMBER() OVER (ORDER BY xp DESC,user_id ASC)::INTEGER position,
		COUNT(*) OVER ()::INTEGER total FROM level_users WHERE guild_id=$1) ranked WHERE user_id=$2`, [guildId, userId]);
	return rows[0] || { position: null, total: 0 };
}
async function awardXp(guildId, userId, amount) {
	await requireDatabase();
	const { rows } = await pool.query(`INSERT INTO level_users (guild_id,user_id,xp) VALUES ($1,$2,$3)
		ON CONFLICT (guild_id,user_id) DO UPDATE SET xp=level_users.xp+EXCLUDED.xp,updated_at=NOW() RETURNING xp`,
		[guildId, userId, amount]);
	return Number(rows[0].xp);
}
async function getRewardRoleIds(guildId, from, to) {
	if (to <= from) return [];
	const { rows } = await pool.query(
		'SELECT DISTINCT role_id FROM level_rewards WHERE guild_id=$1 AND level>$2 AND level<=$3', [guildId, from, to]);
	return rows.map(row => row.role_id);
}
async function addXp(guild, userId, amount) {
	const xpAmount = Number(amount);
	if (!guild || !Number.isInteger(xpAmount) || xpAmount <= 0) throw new TypeError('XP amount must be a positive integer.');
	const xp = await awardXp(guild.id, userId, xpAmount);
	const previousLevel = levelFromXp(xp - xpAmount);
	const level = levelFromXp(xp);
	const roleIds = await getRewardRoleIds(guild.id, previousLevel, level);
	const member = await guild.members.fetch(userId).catch(() => null);
	const rewardRoles = [];
	if (member) {
		for (const roleId of roleIds) { const role = await guild.roles.fetch(roleId).catch(() => null); if (role) rewardRoles.push(role); }
		if (rewardRoles.length) await member.roles.add(rewardRoles, 'Level reward').catch(console.error);
	}
	return { xp, xpAdded: xpAmount, previousLevel, level, rewardRoles };
}
async function handleLevelMessage(message) {
	if (!message.guild || message.author.bot) return;
	const key = `${message.guild.id}:${message.author.id}`;
	const now = Date.now();
	if (now - (cooldowns.get(key) || 0) < XP_COOLDOWN_MS) return;
	cooldowns.set(key, now);
	const xp = await awardXp(message.guild.id, message.author.id, XP_PER_MESSAGE);
	const previousLevel = levelFromXp(xp - XP_PER_MESSAGE);
	const newLevel = levelFromXp(xp);
	if (newLevel <= previousLevel) return XP_PER_MESSAGE;
	const roleIds = await getRewardRoleIds(message.guild.id, previousLevel, newLevel);
	const rewardRoles = [];
	for (const roleId of roleIds) { const role = await message.guild.roles.fetch(roleId).catch(() => null); if (role) rewardRoles.push(role); }
	if (rewardRoles.length) {
		const member = await message.guild.members.fetch(message.author.id).catch(() => null);
		if (member) await member.roles.add(rewardRoles).catch(console.error);
	}
	const settings = await getLevelSettings(message.guild.id);
	const channel = settings.announcementChannelId
		? await message.guild.channels.fetch(settings.announcementChannelId).catch(() => null) : message.channel;
	const target = channel?.isTextBased() ? channel : message.channel;
	const rewardText = rewardRoles.length ? ` Reward: ${rewardRoles.map(role => `${role}`).join(', ')}` : '';
	await target.send(`${message.author} reached level ${newLevel}!${rewardText}`).catch(console.error);
	return XP_PER_MESSAGE;
}

function eligibleVoiceMembers(guild) {
	const members = new Map();
	for (const state of guild.voiceStates?.cache?.values?.() || []) {
		const member = state.member;
		if (!state.channelId || !member || member.user?.bot || state.channelId === guild.afkChannelId) continue;
		members.set(member.id, member);
	}
	return [...members.values()];
}

async function awardVoiceXp(guild) {
	const members = eligibleVoiceMembers(guild);
	let awarded = 0;
	for (const member of members) {
		const result = await addXp(guild, member.id, XP_PER_VOICE_INTERVAL);
		awarded++;
		if (result.level <= result.previousLevel) continue;
		const settings = await getLevelSettings(guild.id);
		const channel = settings.announcementChannelId
			? await guild.channels.fetch(settings.announcementChannelId).catch(() => null)
			: null;
		if (channel?.isTextBased()) {
			const rewardText = result.rewardRoles.length ? ` Beloning: ${result.rewardRoles.map(role => `${role}`).join(', ')}` : '';
			await channel.send(`${member} heeft level ${result.level} bereikt door actief te zijn in een voicekanaal!${rewardText}`).catch(console.error);
		}
	}
	return awarded;
}

async function awardAllVoiceXp(client) {
	for (const guild of client.guilds.cache.values()) {
		await awardVoiceXp(guild).catch(error => console.error(`Voice XP failed for guild ${guild.id}:`, error));
	}
}

function startVoiceXpScheduler(client, intervalMs = VOICE_XP_INTERVAL_MS) {
	return setInterval(() => awardAllVoiceXp(client), intervalMs);
}

module.exports = { addXp, addLevelReward, deleteLevelReward, deleteLevelAnnouncementChannel,
	awardVoiceXp, eligibleVoiceMembers, getLevelLeaderboard, getLevelRewards, getLevelSettings, getUserLevel,
	getUserRank, handleLevelMessage, levelFromXp, setLevelAnnouncementChannel, setLevelReward,
	startVoiceXpScheduler, xpForLevel, VOICE_XP_INTERVAL_MS, XP_PER_MESSAGE, XP_PER_VOICE_INTERVAL };
