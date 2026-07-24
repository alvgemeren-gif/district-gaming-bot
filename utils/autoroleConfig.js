const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'autorole-config.json');

function readConfig() {
	if (!fs.existsSync(CONFIG_PATH)) {
		return {};
	}

	try {
		return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
	} catch (error) {
		console.error('Failed to read autorole config:', error);
		return {};
	}
}

function writeConfig(config) {
	fs.mkdirSync(DATA_DIR, { recursive: true });
	fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function getAutoroleConfig(guildId) {
	return readConfig()[guildId] || { roleIds: [] };
}

function setAutoroleConfig(guildId, roleIds) {
	const configs = readConfig();
	configs[guildId] = { roleIds };
	writeConfig(configs);
}

function deleteAutoroleConfig(guildId) {
	const configs = readConfig();
	delete configs[guildId];
	writeConfig(configs);
}

module.exports = {
	deleteAutoroleConfig,
	getAutoroleConfig,
	setAutoroleConfig,
};
