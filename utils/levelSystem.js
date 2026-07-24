const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_PATH = path.join(DATA_DIR, 'levels.json');
const XP_PER_MESSAGE = 15;
const XP_COOLDOWN_MS = 60000;
const cooldowns = new Map();

function readData() {
	if (!fs.existsSync(DATA_PATH)) {
		return { guilds: {} };
	}

	try {
		return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
	} catch (error) {
		console.error('Failed to read level data:', error);
		return { guilds: {} };
	}
}

function writeData(data) {
	fs.mkdirSync(DATA_DIR, { recursive: true });
	fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function getGuildData(data, guildId) {
	if (!data.guilds[guildId]) {
		data.guilds[guildId] = { users: {}, rewards: {}, announcementChannelId: null };
	}

	return data.guilds[guildId];
}

function xpForLevel(level) {
	return level * level * 100;
}

function levelFromXp(xp) {
	let level = 0;

	while (xp >= xpForLevel(level + 1)) {
		level += 1;
	}

	return level;
}

function getLevelRewards(guildId) {
	const data = readData();
	return getGuildData(data, guildId).rewards;
}

function getLevelSettings(guildId) {
	const data = readData();
	const guildData = getGuildData(data, guildId);

	return {
		announcementChannelId: guildData.announcementChannelId || null,
	};
}

function setLevelAnnouncementChannel(guildId, channelId) {
	const data = readData();
	const guildData = getGuildData(data, guildId);
	guildData.announcementChannelId = channelId;
	writeData(data);
}

function deleteLevelAnnouncementChannel(guildId) {
	const data = readData();
	const guildData = getGuildData(data, guildId);
	guildData.announcementChannelId = null;
	writeData(data);
}

function setLevelReward(guildId, level, roleIds) {
	const data = readData();
	const guildData = getGuildData(data, guildId);
	guildData.rewards[level] = roleIds;
	writeData(data);
}

function deleteLevelReward(guildId, level) {
	const data = readData();
	const guildData = getGuildData(data, guildId);
	delete guildData.rewards[level];
	writeData(data);
}

function getUserLevel(guildId, userId) {
	const data = readData();
	const guildData = getGuildData(data, guildId);
	const userData = guildData.users[userId] || { xp: 0, level: 0 };

	return {
		xp: userData.xp,
		level: userData.level,
		nextLevelXp: xpForLevel(userData.level + 1),
	};
}

async function handleLevelMessage(message) {
	if (!message.guild || message.author.bot) {
		return;
	}

	const cooldownKey = `${message.guild.id}:${message.author.id}`;
	const now = Date.now();
	const lastXpAt = cooldowns.get(cooldownKey) || 0;

	if (now - lastXpAt < XP_COOLDOWN_MS) {
		return;
	}

	cooldowns.set(cooldownKey, now);

	const data = readData();
	const guildData = getGuildData(data, message.guild.id);
	const userData = guildData.users[message.author.id] || { xp: 0, level: 0 };

	userData.xp += XP_PER_MESSAGE;
	const newLevel = levelFromXp(userData.xp);

	if (newLevel <= userData.level) {
		guildData.users[message.author.id] = userData;
		writeData(data);
		return;
	}

	userData.level = newLevel;
	guildData.users[message.author.id] = userData;
	writeData(data);

	const rewardRoleIds = guildData.rewards[newLevel] || [];
	const rewardRoles = [];

	for (const roleId of rewardRoleIds) {
		const role = await message.guild.roles.fetch(roleId).catch(() => null);

		if (role) {
			rewardRoles.push(role);
		}
	}

	if (rewardRoles.length) {
		const member = await message.guild.members.fetch(message.author.id).catch(() => null);

		if (member) {
			await member.roles.add(rewardRoles).catch(console.error);
		}
	}

	const rewardText = rewardRoles.length
		? ` Beloning: ${rewardRoles.map(role => `${role}`).join(', ')}`
		: '';
	const announcementChannel = guildData.announcementChannelId
		? await message.guild.channels.fetch(guildData.announcementChannelId).catch(() => null)
		: message.channel;
	const targetChannel = announcementChannel?.isTextBased() ? announcementChannel : message.channel;

	await targetChannel.send(`${message.author} is level ${newLevel}!${rewardText}`).catch(console.error);
}

module.exports = {
	deleteLevelReward,
	deleteLevelAnnouncementChannel,
	getLevelRewards,
	getLevelSettings,
	getUserLevel,
	handleLevelMessage,
	setLevelAnnouncementChannel,
	setLevelReward,
};
