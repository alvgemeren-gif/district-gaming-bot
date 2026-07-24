const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.CLIENT_TOKEN || process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID || process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || process.env.DISCORD_GUILD_ID;

const deploy = async () => {
    if (!BOT_TOKEN || !CLIENT_ID) {
        console.warn('Skipping command deploy because the bot token or client id is missing.');
        return;
    }

    const commands = [];
    // Grab all the command files from the commands directory you created earlier
    const foldersPath = path.join(__dirname, '../commands');
    const commandFolders = fs.existsSync(foldersPath) ? fs.readdirSync(foldersPath) : [];
    
    for (const folder of commandFolders) {
        // Grab all the command files from the commands directory you created earlier
        const commandsPath = path.join(foldersPath, folder);
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        // Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                commands.push(command.data.toJSON());
            } else {
                console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        }
    }
    
    // Construct and prepare an instance of the REST module
    const rest = new REST().setToken(BOT_TOKEN);
    
    // and deploy your commands!
    (async () => {
        try {
            console.log(`Started refreshing ${commands.length} application (/) commands.`);
    
            const scopedGuildId = GUILD_ID && GUILD_ID !== CLIENT_ID ? GUILD_ID : null;

            if (GUILD_ID && GUILD_ID === CLIENT_ID) {
                console.warn('Ignoring GUILD_ID because it matches CLIENT_ID. Set GUILD_ID to your Discord server id for guild commands.');
            }

            const route = scopedGuildId
                ? Routes.applicationGuildCommands(CLIENT_ID, scopedGuildId)
                : Routes.applicationCommands(CLIENT_ID);

            const data = await rest.put(
                route,
                { body: commands }
            );
    
            console.log(`Successfully reloaded ${data.length} application (/) commands.`);
        } catch (error) {
            // And of course, make sure you catch and log any errors!
            console.error(error);
        }
    })();
}



module.exports = deploy;
