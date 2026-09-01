const crypto = require('crypto');
const { pool, requireDatabase } = require('./scoreStore');

let schemaPromise;

async function ensureSchema() {
	await requireDatabase();
	if (!schemaPromise) {
		schemaPromise = pool.query(`
			CREATE TABLE IF NOT EXISTS ticket_panels (
				guild_id TEXT NOT NULL,
				panel_id TEXT NOT NULL,
				title TEXT NOT NULL,
				description TEXT NOT NULL,
				button_label TEXT NOT NULL,
				category_id TEXT NOT NULL,
				support_role_id TEXT NOT NULL,
				color INTEGER NOT NULL,
				created_by TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				PRIMARY KEY (guild_id, panel_id)
			);

			CREATE TABLE IF NOT EXISTS support_tickets (
				guild_id TEXT NOT NULL,
				channel_id TEXT NOT NULL,
				panel_id TEXT NOT NULL,
				user_id TEXT NOT NULL,
				support_role_id TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'open',
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				closed_by TEXT,
				closed_at TIMESTAMPTZ,
				PRIMARY KEY (guild_id, channel_id)
			);

			CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_one_open_per_panel
				ON support_tickets (guild_id, panel_id, user_id)
				WHERE status = 'open';
		`);
	}
	return schemaPromise;
}

function mapPanel(row) {
	if (!row) return null;
	return {
		id: row.panel_id,
		title: row.title,
		description: row.description,
		buttonLabel: row.button_label,
		categoryId: row.category_id,
		supportRoleId: row.support_role_id,
		color: row.color,
		createdBy: row.created_by,
	};
}

function mapTicket(row) {
	if (!row) return null;
	return {
		channelId: row.channel_id,
		panelId: row.panel_id,
		userId: row.user_id,
		supportRoleId: row.support_role_id,
		status: row.status,
		createdAt: row.created_at,
		closedBy: row.closed_by,
		closedAt: row.closed_at,
	};
}

async function createPanel(guildId, panel) {
	await ensureSchema();
	const panelId = crypto.randomBytes(4).toString('hex');
	const result = await pool.query(
		`INSERT INTO ticket_panels
		 (guild_id, panel_id, title, description, button_label, category_id, support_role_id, color, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING *`,
		[guildId, panelId, panel.title, panel.description, panel.buttonLabel, panel.categoryId,
			panel.supportRoleId, panel.color, panel.createdBy]
	);
	return mapPanel(result.rows[0]);
}

async function getPanel(guildId, panelId) {
	await ensureSchema();
	const result = await pool.query(
		'SELECT * FROM ticket_panels WHERE guild_id = $1 AND panel_id = $2',
		[guildId, panelId]
	);
	return mapPanel(result.rows[0]);
}

async function getPanels(guildId) {
	await ensureSchema();
	const result = await pool.query(
		'SELECT * FROM ticket_panels WHERE guild_id = $1 ORDER BY created_at',
		[guildId]
	);
	return result.rows.map(mapPanel);
}

async function findOpenTicket(guildId, panelId, userId) {
	await ensureSchema();
	const result = await pool.query(
		`SELECT * FROM support_tickets
		 WHERE guild_id = $1 AND panel_id = $2 AND user_id = $3 AND status = 'open'`,
		[guildId, panelId, userId]
	);
	return mapTicket(result.rows[0]);
}

async function getTicketByChannel(guildId, channelId) {
	await ensureSchema();
	const result = await pool.query(
		'SELECT * FROM support_tickets WHERE guild_id = $1 AND channel_id = $2',
		[guildId, channelId]
	);
	return mapTicket(result.rows[0]);
}

async function saveTicket(guildId, ticket) {
	await ensureSchema();
	await pool.query(
		`INSERT INTO support_tickets
		 (guild_id, channel_id, panel_id, user_id, support_role_id, status, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		[guildId, ticket.channelId, ticket.panelId, ticket.userId, ticket.supportRoleId,
			ticket.status, ticket.createdAt]
	);
}

async function closeTicket(guildId, channelId, closedBy) {
	await ensureSchema();
	const result = await pool.query(
		`UPDATE support_tickets
		 SET status = 'closed', closed_by = $3, closed_at = NOW()
		 WHERE guild_id = $1 AND channel_id = $2 AND status = 'open'
		 RETURNING *`,
		[guildId, channelId, closedBy]
	);
	return mapTicket(result.rows[0]);
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
