require('dotenv').config();
const http = require('http');
const { Client, Events, GatewayIntentBits } = require('discord.js');

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
	],
});

client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
});

client.login(BOT_TOKEN);
