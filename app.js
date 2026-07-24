require('dotenv').config();
const fs = require('fs');
const http = require('http');
const path = require('path');
const deployCommands = require('./deploy/deployCommands');
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const { getAutoroleConfig } = require('./utils/autoroleConfig');
const { handleLevelMessage } = require('./utils/levelSystem');
const { formatWelcomeMessage, getWelcomeConfig } = require('./utils/welcomeConfig');

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.CLIENT_TOKEN || process.env.DISCORD_TOKEN;

if (!BOT_TOKEN) {
	throw new Error('CLIENT_TOKEN or DISCORD_TOKEN is missing. Add it to Render environment variables or to a local .env file.');
}

http.createServer((_req, res) => {
	res.writeHead(200, { 'Content-Type': 'text/plain' });
	res.end('Bot is running');
}).listen(PORT, () => console.log(`HTTP server listening on port ${PORT}`));

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildMessages,
	],
});

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

deployCommands();

client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
});

client.on(Events.GuildMemberAdd, async member => {
	const autoroleConfig = getAutoroleConfig(member.guild.id);

	if (autoroleConfig.roleIds.length) {
		const roles = [];

		for (const roleId of autoroleConfig.roleIds) {
			const role = await member.guild.roles.fetch(roleId).catch(() => null);

			if (role) {
				roles.push(role);
			}
		}

		if (roles.length) {
			await member.roles.add(roles).catch(console.error);
		}
	}

	const config = getWelcomeConfig(member.guild.id);

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

client.on(Events.MessageCreate, handleLevelMessage);

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
			content: 'Er ging iets mis bij het uitvoeren van deze actie.',
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
