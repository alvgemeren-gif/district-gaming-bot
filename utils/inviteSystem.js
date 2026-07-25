const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_PATH = path.join(DATA_DIR, 'invites.json');
const inviteSnapshots = new Map();
const guildQueues = new Map();

function readData() {
	if (!fs.existsSync(DATA_PATH)) return { guilds: {} };

	try {
		return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
	} catch (error) {
		console.error('Kon invitegegevens niet lezen:', error);
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
	data.guilds[guildId] ||= { invitedMembers: {}, rewards: {} };
	data.guilds[guildId].invitedMembers ||= {};
	data.guilds[guildId].rewards ||= {};
	return data.guilds[guildId];
}

function snapshotInvites(invites) {
	return new Map(invites.map(invite => [
		invite.code,
		{ uses: invite.uses || 0, inviterId: invite.inviter?.id || null },
	]));
}

function findUsedInvite(previous, current) {
	return [...current.entries()]
		.map(([code, invite]) => ({
			code,
			inviterId: invite.inviterId,
			increase: invite.uses - (previous.get(code)?.uses || 0),
		}))
		.filter(invite => invite.inviterId && invite.increase > 0)
		.sort((a, b) => b.increase - a.increase)[0] || null;
}

function getInviteCount(guildId, userId) {
	const guildData = getGuildData(readData(), guildId);
	return Object.values(guildData.invitedMembers)
		.filter(invitation => invitation.inviterId === userId).length;
}

function getInviteLeaderboard(guildId, limit = 10) {
	const guildData = getGuildData(readData(), guildId);
	const counts = {};

	for (const invitation of Object.values(guildData.invitedMembers)) {
		counts[invitation.inviterId] = (counts[invitation.inviterId] || 0) + 1;
	}

	return Object.entries(counts)
		.map(([userId, count]) => ({ userId, count }))
		.sort((a, b) => b.count - a.count || a.userId.localeCompare(b.userId))
		.slice(0, Math.max(1, limit));
}

function getInviteRewards(guildId) {
	return getGuildData(readData(), guildId).rewards;
}

function addInviteReward(guildId, count, roleId) {
	const data = readData();
	const guildData = getGuildData(data, guildId);
	guildData.rewards[count] = [...new Set([...(guildData.rewards[count] || []), roleId])];
	writeData(data);
}

function deleteInviteReward(guildId, count, roleId = null) {
	const data = readData();
	const guildData = getGuildData(data, guildId);

	if (roleId) {
		guildData.rewards[count] = (guildData.rewards[count] || [])
			.filter(savedRoleId => savedRoleId !== roleId);
		if (!guildData.rewards[count].length) delete guildData.rewards[count];
	} else {
		delete guildData.rewards[count];
	}

	writeData(data);
}

async function syncInviteRoles(guild, userId) {
	const member = await guild.members.fetch(userId).catch(() => null);
	if (!member) return;

	const count = getInviteCount(guild.id, userId);
	const rewards = getInviteRewards(guild.id);
	const configuredRoleIds = [...new Set(Object.values(rewards).flat())];
	const earnedRoleIds = new Set(
		Object.entries(rewards)
			.filter(([required]) => count >= Number(required))
			.flatMap(([, roleIds]) => roleIds)
	);
	const addRoleIds = configuredRoleIds.filter(roleId =>
		earnedRoleIds.has(roleId) && !member.roles.cache.has(roleId)
	);
	const removeRoleIds = configuredRoleIds.filter(roleId =>
		!earnedRoleIds.has(roleId) && member.roles.cache.has(roleId)
	);

	if (addRoleIds.length) await member.roles.add(addRoleIds).catch(console.error);
	if (removeRoleIds.length) await member.roles.remove(removeRoleIds).catch(console.error);
}

async function fetchSnapshot(guild) {
	const invites = await guild.invites.fetch();
	return snapshotInvites([...invites.values()]);
}

async function initializeInviteTracking(guild) {
	try {
		inviteSnapshots.set(guild.id, await fetchSnapshot(guild));
	} catch (error) {
		console.warn(`Invite-tracking is niet beschikbaar voor server ${guild.id}:`, error.message);
	}
}

function queueGuildTask(guildId, task) {
	const previous = guildQueues.get(guildId) || Promise.resolve();
	const next = previous.catch(() => {}).then(task);
	guildQueues.set(guildId, next);
	next.finally(() => {
		if (guildQueues.get(guildId) === next) guildQueues.delete(guildId);
	});
	return next;
}

async function handleInviteMemberAdd(member) {
	if (member.user.bot) return;

	return queueGuildTask(member.guild.id, async () => {
		const previous = inviteSnapshots.get(member.guild.id) || new Map();
		let current;

		try {
			current = await fetchSnapshot(member.guild);
		} catch (error) {
			console.warn(`Kon invites na binnenkomst van ${member.id} niet ophalen:`, error.message);
			return;
		}

		inviteSnapshots.set(member.guild.id, current);
		const usedInvite = findUsedInvite(previous, current);
		if (!usedInvite || usedInvite.inviterId === member.id) return;

		const data = readData();
		const guildData = getGuildData(data, member.guild.id);
		guildData.invitedMembers[member.id] = {
			inviterId: usedInvite.inviterId,
			inviteCode: usedInvite.code,
			joinedAt: new Date().toISOString(),
		};
		writeData(data);
		await syncInviteRoles(member.guild, usedInvite.inviterId);
	});
}

async function handleInviteMemberRemove(member) {
	if (member.user.bot) return;

	const data = readData();
	const guildData = getGuildData(data, member.guild.id);
	const invitation = guildData.invitedMembers[member.id];
	if (!invitation) return;

	delete guildData.invitedMembers[member.id];
	writeData(data);
	await syncInviteRoles(member.guild, invitation.inviterId);
}

function handleInviteCreate(invite) {
	const snapshot = inviteSnapshots.get(invite.guild.id) || new Map();
	snapshot.set(invite.code, {
		uses: invite.uses || 0,
		inviterId: invite.inviter?.id || null,
	});
	inviteSnapshots.set(invite.guild.id, snapshot);
}

function handleInviteDelete(invite) {
	inviteSnapshots.get(invite.guild.id)?.delete(invite.code);
}

module.exports = {
	addInviteReward,
	deleteInviteReward,
	findUsedInvite,
	getInviteCount,
	getInviteLeaderboard,
	getInviteRewards,
	handleInviteCreate,
	handleInviteDelete,
	handleInviteMemberAdd,
	handleInviteMemberRemove,
	initializeInviteTracking,
	snapshotInvites,
	syncInviteRoles,
};
