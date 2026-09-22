const { getAutoroleConfig } = require('./autoroleConfig');
const { getWelcomeConfig, formatWelcomeMessage } = require('./welcomeConfig');
const { getRoleChoice } = require('./roleChoiceStore');
const { handleInviteMemberAdd } = require('./inviteSystem');

async function restoreRoleChoice(member) {
	try {
		const permanentChoice = await getRoleChoice(member.guild.id, member.id);

		if (permanentChoice) {
			const chosenRole = await member.guild.roles.fetch(permanentChoice.role_id).catch(() => null);

			if (chosenRole) {
				await member.roles.add(chosenRole).catch(console.error);
			}
		}
	} catch (error) {
		console.error('Could not restore permanent role choice:', error);
	}

}

async function assignAutoroles(member) {
	let autoroleConfig;

	try {
		autoroleConfig = await getAutoroleConfig(member.guild.id);
	} catch (error) {
		console.error('Could not load autorole configuration:', error);
		autoroleConfig = { roleIds: [] };
	}

	for (const roleId of autoroleConfig.roleIds) {
		try {
			const role = await member.guild.roles.fetch(roleId);
			if (!role) {
				console.warn(`Autorole ${roleId} no longer exists in guild ${member.guild.id}.`);
				continue;
			}
			await member.roles.add(role, 'Automatische rollen voor nieuw lid');
		} catch (error) {
			console.error(`Could not assign autorole ${roleId} to member ${member.id} in guild ${member.guild.id}:`, error);
		}
	}
}

async function sendWelcome(member) {
	let config;

	try {
		config = await getWelcomeConfig(member.guild.id);
	} catch (error) {
		console.error('Could not load welcome configuration:', error);
		return;
	}

	if (!config) {
		return;
	}

	const channel = await member.guild.channels.fetch(config.channelId).catch(() => null);

	if (!channel || !channel.isTextBased()) {
		console.warn(`Welcome channel ${config.channelId} was not found or is not text-based.`);
		return;
	}

	await channel.send(formatWelcomeMessage(config.message, member)).catch(console.error);
}

async function handleMemberJoin(member) {
	// Invite API requests and role restoration must not delay welcomes or autoroles.
	await Promise.all([
		['invite tracking', handleInviteMemberAdd],
		['role choice restoration', restoreRoleChoice],
		['autoroles', assignAutoroles],
		['welcome message', sendWelcome],
	].map(async ([name, handler]) => {
		try {
			await handler(member);
		} catch (error) {
			console.error(`Could not process ${name} for member ${member.id} in guild ${member.guild.id}:`, error);
		}
	}));
}

module.exports = { handleMemberJoin };
