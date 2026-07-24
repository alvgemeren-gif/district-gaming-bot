const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'suggestion-config.json');

function readConfig() {
	if (!fs.existsSync(CONFIG_PATH)) {
		return {};
	}

	try {
		return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
	} catch (error) {
		console.error('Failed to read suggestion config:', error);
		return {};
	}
}

function writeConfig(config) {
	fs.mkdirSync(DATA_DIR, { recursive: true });
	fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function getSuggestionConfig(guildId) {
	return readConfig()[guildId] || null;
}

function setSuggestionConfig(guildId, channelId) {
	const config = readConfig();
	config[guildId] = { channelId };
	writeConfig(config);
}

function deleteSuggestionConfig(guildId) {
	const config = readConfig();
	delete config[guildId];
	writeConfig(config);
}

module.exports = {
	deleteSuggestionConfig,
	getSuggestionConfig,
	setSuggestionConfig,
};
