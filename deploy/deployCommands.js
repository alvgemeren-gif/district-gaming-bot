const { REST, Routes } = require('discord.js');

const BOT_TOKEN = process.env.CLIENT_TOKEN || process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID || process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || process.env.DISCORD_GUILD_ID;

const deploy = async (guildIds = [], commands = []) => {
    if (!BOT_TOKEN || !CLIENT_ID) {
        console.warn('Skipping command removal because the bot token or client id is missing.');
        return;
    }

    const rest = new REST().setToken(BOT_TOKEN);

    const uniqueGuildIds = new Set(guildIds);
    if (GUILD_ID && GUILD_ID !== CLIENT_ID) {
        uniqueGuildIds.add(GUILD_ID);
    }

	await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
	await Promise.all([...uniqueGuildIds].map(async guildId => {
		await rest.put(
			Routes.applicationGuildCommands(CLIENT_ID, guildId),
			{ body: commands },
		);
	}));

	console.log(`Registered ${commands.length} application (/) command(s) in ${uniqueGuildIds.size} server(s).`);
};



module.exports = deploy;
