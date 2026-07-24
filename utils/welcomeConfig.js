const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'welcome-config.json');

function readConfig() {
	if (!fs.existsSync(CONFIG_PATH)) {
		return {};
	}

	try {
		return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
	} catch (error) {
		console.error('Failed to read welcome config:', error);
		return {};
	}
}

function writeConfig(config) {
	fs.mkdirSync(DATA_DIR, { recursive: true });
	fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function getWelcomeConfig(guildId) {
	return readConfig()[guildId] || null;
}

function setWelcomeConfig(guildId, config) {
	const configs = readConfig();
	configs[guildId] = config;
	writeConfig(configs);
}

function deleteWelcomeConfig(guildId) {
	const configs = readConfig();
	delete configs[guildId];
	writeConfig(configs);
}

function formatWelcomeMessage(template, member) {
	return template
		.replaceAll('\\n', '\n')
		.replaceAll('{user}', `${member}`)
		.replaceAll('{username}', member.user.username)
		.replaceAll('{server}', member.guild.name)
		.replaceAll('{membercount}', `${member.guild.memberCount}`);
}

module.exports = {
	deleteWelcomeConfig,
	formatWelcomeMessage,
	getWelcomeConfig,
	setWelcomeConfig,
};
