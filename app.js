require('dotenv').config();
const fs = require('fs');
const http = require('http');
const path = require('path');
const deployCommands = require('./deploy/deployCommands');
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const { getAutoroleConfig } = require('./utils/autoroleConfig');
const { handleLevelMessage } = require('./utils/levelSystem');
const {
	handleInviteCreate,
	handleInviteDelete,
	handleInviteMemberAdd,
	handleInviteMemberRemove,
	initializeInviteTracking,
} = require('./utils/inviteSystem');
const { getRoleChoice } = require('./utils/roleChoiceStore');
const { refreshLiveScoreboard } = require('./utils/liveScoreboard');
const { refreshLivePlayerLeaderboard } = require('./utils/livePlayerLeaderboard');
const { refreshLiveMonthlyLeaderboard } = require('./utils/liveMonthlyLeaderboard');
const { formatWelcomeMessage, getWelcomeConfig } = require('./utils/welcomeConfig');
const { createAdminDashboardHandler } = require('./utils/adminDashboard');
const { createVictoryVerifierHandler } = require('./utils/victoryVerifierHandler');
const { createDailyGameHandler } = require('./utils/dailyGame');
const { createCityGameHandler } = require('./utils/cityGame');
const { createDropQuizHandler } = require('./utils/dropQuiz');
const { refreshAllFortniteShops } = require('./utils/fortniteShop');
const { refreshAllFortniteUpdates } = require('./utils/fortniteUpdates');
const { startBumpReminder } = require('./utils/bumpReminder');
const { startArtChallengeScheduler } = require('./utils/artChallenge');
const { startDailyPollScheduler } = require('./utils/dailyPoll');
const { startBirthdayScheduler } = require('./utils/birthdaySystem');
const { expireTemporaryRole, getActiveTemporaryRoles } = require('./utils/supplyDropStore');

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.CLIENT_TOKEN || process.env.DISCORD_TOKEN;

if (!BOT_TOKEN) {
	throw new Error('CLIENT_TOKEN or DISCORD_TOKEN is missing. Add it to Render environment variables or to a local .env file.');
}

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildInvites,
	],
});

const dailyGameHandler = createDailyGameHandler(client);
const cityGameHandler = createCityGameHandler(client);
const dropQuizHandler = createDropQuizHandler();
const adminDashboardHandler = createAdminDashboardHandler(client);
const victoryVerifierHandler = createVictoryVerifierHandler();
http.createServer(async (req, res) => {
	if (await dropQuizHandler(req, res)) return;
	if (await cityGameHandler(req, res)) return;
	if (await dailyGameHandler(req, res)) return;
	if (await victoryVerifierHandler(req, res)) return;
	return adminDashboardHandler(req, res);
})
	.listen(PORT, () => console.log(`HTTP server listening on port ${PORT}; dashboard: /admin`));

client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.existsSync(foldersPath) ? fs.readdirSync(foldersPath) : [];

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);

		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

async function refreshAllLiveScoreboards(discordClient) {
	for (const guild of discordClient.guilds.cache.values()) {
		await Promise.all([
			refreshLiveScoreboard(guild).catch(error => {
				console.error(`Could not refresh live district scoreboard for guild ${guild.id}:`, error);
			}),
			refreshLivePlayerLeaderboard(guild).catch(error => {
				console.error(`Could not refresh live member leaderboard for guild ${guild.id}:`, error);
			}),
			refreshLiveMonthlyLeaderboard(guild).catch(error => {
				console.error(`Could not refresh live team leaderboard for guild ${guild.id}:`, error);
			}),
		]);
	}
}

client.once(Events.ClientReady, async c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
	const visibleCommands = [
		client.commands.get('announcement')?.data.toJSON(),
		client.commands.get('autorole')?.data.toJSON(),
		client.commands.get('choice-roles')?.data.toJSON(),
		client.commands.get('create')?.data.toJSON(),
		client.commands.get('embed')?.data.toJSON(),
		client.commands.get('guess-number')?.data.toJSON(),
		client.commands.get('level')?.data.toJSON(),
		client.commands.get('level-admin')?.data.toJSON(),
		client.commands.get('leaderboard')?.data.toJSON(),
		client.commands.get('meme')?.data.toJSON(),
		client.commands.get('poll')?.data.toJSON(),
		client.commands.get('rank')?.data.toJSON(),
		client.commands.get('ticket')?.data.toJSON(),
		client.commands.get('ticket-admin')?.data.toJSON(),
		client.commands.get('welcome')?.data.toJSON(),
		client.commands.get('verjaardag')?.data.toJSON(),
	].filter(Boolean);
	await deployCommands([...c.guilds.cache.keys()], visibleCommands).catch(error => {
		console.error('Could not register Discord application commands:', error);
	});
	await Promise.all([...c.guilds.cache.values()].map(initializeInviteTracking));
	await Promise.all([
		refreshAllLiveScoreboards(c),
		refreshAllFortniteShops(c).catch(error => {
			console.error('Initial Fortnite shop refresh failed:', error);
		}),
		refreshAllFortniteUpdates(c).catch(error => {
			console.error('Initial Fortnite update refresh failed:', error);
		}),
	]);
	setInterval(() => refreshAllLiveScoreboards(c), 60 * 1000);
	setInterval(() => {
		refreshAllFortniteShops(c).catch(error => {
			console.error('Scheduled Fortnite shop refresh failed:', error);
		});
	}, 15 * 60 * 1000);
	setInterval(() => {
		refreshAllFortniteUpdates(c).catch(error => {
			console.error('Scheduled Fortnite update refresh failed:', error);
		});
	}, 10 * 60 * 1000);
	startBumpReminder(c);
	startArtChallengeScheduler(c);
	startDailyPollScheduler(c);
	startBirthdayScheduler(c);
	const temporaryRoles = await getActiveTemporaryRoles().catch(error => {
		console.error('Could not restore supply drop role timers:', error);
		return [];
	});
	for (const item of temporaryRoles) {
		const delay = Math.max(0, new Date(item.role_expires_at).getTime() - Date.now()) + 1000;
		setTimeout(async () => {
			const expired = await expireTemporaryRole(item.id).catch(error => {
				console.error('Could not expire supply drop role:', error);
				return null;
			});
			if (expired?.shouldRemove) {
				const guild = await c.guilds.fetch(item.guild_id).catch(() => null);
				const member = await guild?.members.fetch(item.claimed_by).catch(() => null);
				if (member) {
					await member.roles.remove(item.role_id, `Supply drop #${item.id} verlopen`).catch(console.error);
				}
			}
		}, delay);
	}
});

client.on(Events.GuildMemberAdd, async member => {
	await handleInviteMemberAdd(member).catch(error => {
		console.error('Could not register the inviter:', error);
	});

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

	let autoroleConfig;

	try {
		autoroleConfig = await getAutoroleConfig(member.guild.id);
	} catch (error) {
		console.error('Could not load autorole configuration:', error);
		autoroleConfig = { roleIds: [] };
	}

	if (autoroleConfig.roleIds.length) {
		const roles = [];

		for (const roleId of autoroleConfig.roleIds) {
			const role = await member.guild.roles.fetch(roleId).catch(() => null);

			if (role) {
				roles.push(role);
			}
		}

		if (roles.length) {
			await member.roles.add(roles, 'Automatische rollen voor nieuw lid').catch(error => {
				console.error(`Could not assign autoroles to member ${member.id}:`, error);
			});
		}
	}

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
});

client.on(Events.GuildMemberRemove, member => {
	handleInviteMemberRemove(member).catch(error => {
		console.error('Could not process the departing invite member:', error);
	});
});
client.on(Events.InviteCreate, handleInviteCreate);
client.on(Events.InviteDelete, handleInviteDelete);
client.on(Events.MessageCreate, async message => {
	const awardedXp = await handleLevelMessage(message);
	if (awardedXp) {
		const command = client.commands.get('supply-drop');
		await command?.handleXpMessage(message, awardedXp).catch(error => {
			console.error('Could not count message for automatic supply drop:', error);
		});
	}
});

client.on(Events.InteractionCreate, async interaction => {
	try {
		if (interaction.isChatInputCommand()) {
			const command = interaction.client.commands.get(interaction.commandName);

			if (!command) {
				console.error(`No command matching ${interaction.commandName} was found.`);
				return;
			}

			await command.execute(interaction);
			return;
		}

		if (interaction.isAnySelectMenu()) {
			const [handlerName] = interaction.customId.split(':');
			const handler = interaction.client.commands.get(handlerName);

			if (handler?.handleSelectMenu) {
				await handler.handleSelectMenu(interaction);
			}
		}

		if (interaction.isButton()) {
			const [handlerName] = interaction.customId.split(':');
			const handler = interaction.client.commands.get(handlerName);

			if (handler?.handleButton) {
				await handler.handleButton(interaction);
			}
		}

		if (interaction.isModalSubmit()) {
			const [handlerName] = interaction.customId.split(':');
			const handler = interaction.client.commands.get(handlerName);

			if (handler?.handleModalSubmit) {
				await handler.handleModalSubmit(interaction);
			}
		}
	} catch (error) {
		console.error(error);

		const response = {
			content: 'Something went wrong while performing this action.',
			ephemeral: true,
		};

		if (interaction.replied || interaction.deferred) {
			await interaction.followUp(response).catch(() => {});
		} else {
			await interaction.reply(response).catch(() => {});
		}
	}
});

client.login(BOT_TOKEN);
