const { EmbedBuilder } = require('discord.js');
const { pool, requireDatabase } = require('./scoreStore');

const API_URL = 'https://fortnite-api.com/v2/shop?lang=nl';
const EMBEDS_PER_MESSAGE = 10;
let schemaPromise;
let refreshPromise;

async function ensureSchema() {
	await requireDatabase();
	if (!schemaPromise) {
		schemaPromise = pool.query(`
			CREATE TABLE IF NOT EXISTS fortnite_shop_panels (
				guild_id TEXT PRIMARY KEY,
				channel_id TEXT NOT NULL,
				message_ids TEXT[] NOT NULL DEFAULT '{}',
				shop_hash TEXT,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
		`);
	}
	return schemaPromise;
}

function firstImage(entry) {
	const cosmetic = entry.items?.[0] || entry.brItems?.[0] || entry.tracks?.[0] || {};
	return entry.bundle?.image ||
		cosmetic.images?.featured ||
		cosmetic.images?.icon ||
		cosmetic.albumArt ||
		null;
}

function displayName(entry) {
	if (entry.bundle?.name) return entry.bundle.name;
	const items = entry.items || entry.brItems || entry.tracks || [];
	if (items.length === 1) {
		const item = items[0];
		return item.name || (item.title && item.artist ? `${item.title} — ${item.artist}` : item.title) || entry.devName || 'Fortnite-item';
	}
	if (items.length > 1) {
		const names = items.slice(0, 3).map(item => item.name || item.title).filter(Boolean);
		return names.length ? `${names.join(' + ')}${items.length > 3 ? ` +${items.length - 3}` : ''}` : entry.devName;
	}
	return entry.devName?.replace(/^\d+\s*x\s*/i, '') || 'Fortnite-item';
}

function normalizeShop(payload) {
	const data = payload?.data || payload || {};
	const entries = Array.isArray(data.entries)
		? data.entries
		: Array.isArray(data)
			? data
			: [];
	return {
		hash: data.hash || data.date || JSON.stringify(entries.map(entry => entry.offerId || entry.devName)),
		date: data.date || new Date().toISOString(),
		vbuckIcon: data.vbuckIcon || null,
		entries: entries.map(entry => ({
			id: entry.offerId || entry.id || entry.devName,
			name: displayName(entry),
			price: Number(entry.finalPrice ?? entry.regularPrice ?? entry.price ?? 0),
			regularPrice: Number(entry.regularPrice ?? entry.finalPrice ?? entry.price ?? 0),
			image: firstImage(entry),
			section: entry.layout?.name || entry.layout?.category || entry.section?.name || 'Item Shop',
			items: (entry.items || entry.brItems || entry.tracks || []).length,
			banner: entry.banner?.value || entry.banner?.text || null,
		})),
	};
}

async function fetchShop() {
	const headers = { 'User-Agent': 'Cozy-Hotel-Discord-Bot/1.0' };
	if (process.env.FORTNITE_API_KEY) headers.Authorization = process.env.FORTNITE_API_KEY;
	const response = await fetch(API_URL, { headers, signal: AbortSignal.timeout(15_000) });
	if (!response.ok) throw new Error(`Fortnite shop API returned ${response.status}.`);
	const payload = await response.json();
	if (payload.status && payload.status !== 200) throw new Error(payload.error || 'Fortnite shop API rejected the request.');
	const shop = normalizeShop(payload);
	if (!shop.entries.length) throw new Error('The Fortnite shop API returned no offers.');
	return shop;
}

function priceText(entry) {
	const discount = entry.regularPrice > entry.price
		? ` ~~${entry.regularPrice.toLocaleString('nl-NL')}~~`
		: '';
	return `**${entry.price.toLocaleString('nl-NL')} V-Bucks**${discount}`;
}

function buildShopEmbeds(shop) {
	return shop.entries.map((entry, index) => {
		const embed = new EmbedBuilder()
			.setColor(index === 0 ? 0x55d6ff : 0x1f8fff)
			.setTitle(entry.name.slice(0, 256))
			.setDescription([
				priceText(entry),
				entry.section ? `Onderdeel: ${entry.section}` : null,
				entry.items > 1 ? `Bundel met ${entry.items} items` : null,
				entry.banner,
			].filter(Boolean).join('\n').slice(0, 4096));
		if (entry.image && /^https:\/\//.test(entry.image)) embed.setThumbnail(entry.image);
		if (index === 0) {
			embed.setAuthor({ name: `FORTNITE ITEM SHOP · ${shop.entries.length} aanbiedingen` });
		}
		embed.setFooter({
			text: index === shop.entries.length - 1
				? 'Alleen bekijken · Aankopen is niet mogelijk via Discord'
				: `${index + 1} / ${shop.entries.length}`,
		});
		return embed;
	});
}

function messagePayloads(shop) {
	const embeds = buildShopEmbeds(shop);
	const payloads = [];
	for (let index = 0; index < embeds.length; index += EMBEDS_PER_MESSAGE) {
		payloads.push({
			content: index === 0
				? `## 🛒 Fortnite Item Shop\nLaatst gecontroleerd <t:${Math.floor(Date.now() / 1000)}:R> · alleen-lezen`
				: null,
			embeds: embeds.slice(index, index + EMBEDS_PER_MESSAGE),
			components: [],
		});
	}
	return payloads;
}

async function getPanel(guildId) {
	await ensureSchema();
	const result = await pool.query(
		'SELECT guild_id, channel_id, message_ids, shop_hash, updated_at FROM fortnite_shop_panels WHERE guild_id = $1',
		[guildId]
	);
	return result.rows[0] || null;
}

async function getPanels() {
	await ensureSchema();
	const result = await pool.query(
		'SELECT guild_id, channel_id, message_ids, shop_hash, updated_at FROM fortnite_shop_panels'
	);
	return result.rows;
}

async function savePanel(guildId, channelId, messageIds, shopHash) {
	await ensureSchema();
	await pool.query(
		`INSERT INTO fortnite_shop_panels (guild_id, channel_id, message_ids, shop_hash)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (guild_id) DO UPDATE SET
		   channel_id = EXCLUDED.channel_id,
		   message_ids = EXCLUDED.message_ids,
		   shop_hash = EXCLUDED.shop_hash,
		   updated_at = NOW()`,
		[guildId, channelId, messageIds, shopHash]
	);
}

async function publishShop(guild, channel, shop = null) {
	const currentShop = shop || await fetchShop();
	const existing = await getPanel(guild.id);
	const oldMessages = existing?.channel_id === channel.id ? existing.message_ids : [];
	const payloads = messagePayloads(currentShop);
	const messageIds = [];

	for (let index = 0; index < payloads.length; index += 1) {
		const oldId = oldMessages[index];
		const oldMessage = oldId ? await channel.messages.fetch(oldId).catch(() => null) : null;
		const message = oldMessage
			? await oldMessage.edit(payloads[index])
			: await channel.send(payloads[index]);
		messageIds.push(message.id);
	}
	for (const staleId of oldMessages.slice(payloads.length)) {
		const stale = await channel.messages.fetch(staleId).catch(() => null);
		if (stale?.author.id === guild.members.me?.id) await stale.delete().catch(() => {});
	}
	if (existing && existing.channel_id !== channel.id) {
		const oldChannel = await guild.channels.fetch(existing.channel_id).catch(() => null);
		if (oldChannel?.isTextBased()) {
			for (const oldId of existing.message_ids) {
				const oldMessage = await oldChannel.messages.fetch(oldId).catch(() => null);
				if (oldMessage?.author.id === guild.members.me?.id) await oldMessage.delete().catch(() => {});
			}
		}
	}
	await savePanel(guild.id, channel.id, messageIds, currentShop.hash);
	return { offers: currentShop.entries.length, messages: messageIds.length };
}

async function refreshFortniteShop(guild, shop = null) {
	const panel = await getPanel(guild.id);
	if (!panel) return null;
	const currentShop = shop || await fetchShop();
	if (panel.shop_hash === currentShop.hash) {
		return { unchanged: true, offers: currentShop.entries.length, messages: panel.message_ids.length };
	}
	const channel = await guild.channels.fetch(panel.channel_id).catch(() => null);
	if (!channel?.isTextBased()) return null;
	return publishShop(guild, channel, currentShop);
}

async function refreshAllFortniteShops(client) {
	if (refreshPromise) return refreshPromise;
	refreshPromise = (async () => {
		const panels = await getPanels();
		if (!panels.length) return;
		const shop = await fetchShop();
		for (const panel of panels) {
			const guild = client.guilds.cache.get(panel.guild_id);
			if (guild) {
				await refreshFortniteShop(guild, shop).catch(error => {
					console.error(`Could not refresh Fortnite shop for guild ${guild.id}:`, error);
				});
			}
		}
	})().finally(() => { refreshPromise = null; });
	return refreshPromise;
}

module.exports = {
	buildShopEmbeds,
	fetchShop,
	messagePayloads,
	normalizeShop,
	publishShop,
	refreshAllFortniteShops,
	refreshFortniteShop,
};
