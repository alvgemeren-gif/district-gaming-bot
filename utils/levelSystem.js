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
	const temporaryPath = `${DATA_PATH}.tmp`;
	fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2));
	fs.renameSync(temporaryPath, DATA_PATH);
}

function getGuildData(data, guildId) {
	if (!data.guilds[guildId]) {
		data.guilds[guildId] = { users: {}, rewards: {}, announcementChannelId: null };
	}

	data.guilds[guildId].users ||= {};
	data.guilds[guildId].rewards ||= {};
	data.guilds[guildId].announcementChannelId ||= null;
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
	guildData.rewards[level] = [...new Set(roleIds)];
	writeData(data);
}

function addLevelReward(guildId, level, roleId) {
	const rewards = getLevelRewards(guildId);
	const roleIds = rewards[level] || [];
	setLevelReward(guildId, level, [...roleIds, roleId]);
}

function deleteLevelReward(guildId, level, roleId = null) {
	const data = readData();
	const guildData = getGuildData(data, guildId);

	if (roleId) {
		const remainingRoleIds = (guildData.rewards[level] || [])
			.filter(savedRoleId => savedRoleId !== roleId);

		if (remainingRoleIds.length) {
			guildData.rewards[level] = remainingRoleIds;
		} else {
			delete guildData.rewards[level];
		}
	} else {
		delete guildData.rewards[level];
	}

	writeData(data);
}

function getUserLevel(guildId, userId) {
	const data = readData();
	const guildData = getGuildData(data, guildId);
	const userData = guildData.users[userId] || { xp: 0, level: 0 };
	const xp = Number(userData.xp) || 0;
	const level = levelFromXp(xp);

	return {
		xp,
		level,
		currentLevelXp: xpForLevel(level),
		nextLevelXp: xpForLevel(level + 1),
	};
}

function getLevelLeaderboard(guildId, limit = 10) {
	const data = readData();
	const guildData = getGuildData(data, guildId);

	return Object.entries(guildData.users)
		.map(([userId, userData]) => ({
			userId,
			xp: Number(userData.xp) || 0,
			level: levelFromXp(Number(userData.xp) || 0),
		}))
		.sort((a, b) => b.xp - a.xp || a.userId.localeCompare(b.userId))
		.slice(0, Math.max(1, limit));
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
	userData.xp = Number(userData.xp) || 0;
	const previousLevel = levelFromXp(userData.xp);
	userData.level = previousLevel;

	userData.xp += XP_PER_MESSAGE;
	const newLevel = levelFromXp(userData.xp);

	if (newLevel <= previousLevel) {
		guildData.users[message.author.id] = userData;
		writeData(data);
		return;
	}

	userData.level = newLevel;
	guildData.users[message.author.id] = userData;
	writeData(data);

	const rewardRoleIds = [...new Set(
		Array.from(
			{ length: newLevel - previousLevel },
			(_, index) => previousLevel + index + 1
		).flatMap(level => guildData.rewards[level] || [])
	)];
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
	addLevelReward,
	deleteLevelReward,
	deleteLevelAnnouncementChannel,
	getLevelLeaderboard,
	getLevelRewards,
	getLevelSettings,
	getUserLevel,
	handleLevelMessage,
	levelFromXp,
	setLevelAnnouncementChannel,
	setLevelReward,
	xpForLevel,
};
