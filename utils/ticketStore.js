const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_PATH = path.join(DATA_DIR, 'tickets.json');

function emptyData() {
	return { guilds: {} };
}

function readData() {
	if (!fs.existsSync(DATA_PATH)) {
		return emptyData();
	}

	try {
		return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
	} catch (error) {
		console.error('Failed to read ticket data:', error);
		return emptyData();
	}
}

function writeData(data) {
	fs.mkdirSync(DATA_DIR, { recursive: true });
	const temporaryPath = `${DATA_PATH}.tmp`;
	fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2));
	fs.renameSync(temporaryPath, DATA_PATH);
}

function getGuildData(data, guildId) {
	data.guilds ||= {};
	data.guilds[guildId] ||= { panels: {}, tickets: {} };
	data.guilds[guildId].panels ||= {};
	data.guilds[guildId].tickets ||= {};
	return data.guilds[guildId];
}

function createPanel(guildId, panel) {
	const data = readData();
	const guildData = getGuildData(data, guildId);
	const panelId = crypto.randomBytes(4).toString('hex');
	guildData.panels[panelId] = { id: panelId, ...panel };
	writeData(data);
	return guildData.panels[panelId];
}

function getPanel(guildId, panelId) {
	const data = readData();
	return getGuildData(data, guildId).panels[panelId] || null;
}

function getPanels(guildId) {
	const data = readData();
	return Object.values(getGuildData(data, guildId).panels);
}

function findOpenTicket(guildId, panelId, userId) {
	const data = readData();
	return Object.values(getGuildData(data, guildId).tickets).find(ticket =>
		ticket.panelId === panelId &&
		ticket.userId === userId &&
		ticket.status === 'open'
	) || null;
}

function getTicketByChannel(guildId, channelId) {
	const data = readData();
	return getGuildData(data, guildId).tickets[channelId] || null;
}

function saveTicket(guildId, ticket) {
	const data = readData();
	const guildData = getGuildData(data, guildId);
	guildData.tickets[ticket.channelId] = ticket;
	writeData(data);
}

function closeTicket(guildId, channelId, closedBy) {
	const data = readData();
	const guildData = getGuildData(data, guildId);
	const ticket = guildData.tickets[channelId];

	if (!ticket) {
		return null;
	}

	ticket.status = 'closed';
	ticket.closedBy = closedBy;
	ticket.closedAt = new Date().toISOString();
	writeData(data);
	return ticket;
}

module.exports = {
	closeTicket,
	createPanel,
	findOpenTicket,
	getPanel,
	getPanels,
	getTicketByChannel,
	saveTicket,
};
