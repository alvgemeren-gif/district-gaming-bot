const { EmbedBuilder } = require('discord.js');
const { pool, requireDatabase } = require('./scoreStore');

const API_URL = 'https://fortnite-api.com/v2/shop?lang=en';
const EMBEDS_PER_MESSAGE = 10;
const MAX_NEW_OFFERS = 10;
const FORMAT_VERSION = 'new-only-v4-en';
const CATEGORY_ORDER = ['Bundles', 'Outfits', 'Dances & Emotes', 'Music', 'Pickaxes', 'Gliders', 'Wraps', 'Back Blings', 'Shoes', 'Cars', 'Sidekicks', 'Other'];
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

function offerItems(entry) {
	return entry.items || entry.brItems || entry.tracks || entry.instruments || entry.cars || [];
}

function firstImage(entry) {
	const cosmetic = offerItems(entry)[0] || {};
	return entry.bundle?.image ||
		cosmetic.images?.featured ||
		cosmetic.images?.icon ||
		cosmetic.images?.large ||
		cosmetic.images?.small ||
		cosmetic.albumArt ||
		null;
}

function displayName(entry) {
	if (entry.bundle?.name) return entry.bundle.name;
	const items = offerItems(entry);
	if (items.length === 1) {
		const item = items[0];
		return item.name || (item.title && item.artist ? `${item.title} — ${item.artist}` : item.title) || entry.devName || 'Fortnite item';
	}
	if (items.length > 1) {
		const names = items.slice(0, 3).map(item => item.name || item.title).filter(Boolean);
		return names.length ? `${names.join(' + ')}${items.length > 3 ? ` +${items.length - 3}` : ''}` : entry.devName;
	}
	return entry.devName?.replace(/^\d+\s*x\s*/i, '') || 'Fortnite item';
}

function categoryFor(entry) {
	const items = offerItems(entry);
	if (entry.bundle || items.length > 1) return 'Bundles';
	if (entry.tracks?.length || entry.instruments?.length) return 'Music';
	if (entry.cars?.length) return 'Cars';
	return {
		outfit: 'Outfits',
		emote: 'Dances & Emotes',
		emoji: 'Dances & Emotes',
		spray: 'Dances & Emotes',
		pickaxe: 'Pickaxes',
		glider: 'Gliders',
		wrap: 'Wraps',
		backpack: 'Back Blings',
		shoe: 'Shoes',
		sidekick: 'Sidekicks',
	}[items[0]?.type?.value] || 'Other';
}

function sortEntries(entries) {
	return [...entries].sort((left, right) =>
		CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category) ||
		String(left.section).localeCompare(String(right.section), 'en') ||
		String(left.name).localeCompare(String(right.name), 'en')
	);
}

function newestEntries(entries, shopDate) {
	const markedNew = entries.filter(entry =>
		String(entry.banner?.backendValue || entry.banner?.value || '').toLowerCase() === 'new'
	);
	const rotationDate = String(shopDate || '').slice(0, 10);
	const enteredToday = entries.filter(entry =>
		rotationDate && String(entry.inDate || '').slice(0, 10) === rotationDate
	);
	return (markedNew.length ? markedNew : enteredToday.length ? enteredToday : entries).slice(0, MAX_NEW_OFFERS);
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
		entries: sortEntries(newestEntries(entries, data.date).map(entry => ({
			id: entry.offerId || entry.id || entry.devName,
			name: displayName(entry),
			price: Number(entry.finalPrice ?? entry.regularPrice ?? entry.price ?? 0),
			regularPrice: Number(entry.regularPrice ?? entry.finalPrice ?? entry.price ?? 0),
			image: firstImage(entry),
			section: entry.layout?.name || entry.layout?.category || entry.section?.name || 'Item Shop',
			category: categoryFor(entry),
			items: offerItems(entry).length,
			banner: entry.banner?.value || entry.banner?.text || null,
		}))),
	};
}

async function fetchShop() {
	const headers = { 'User-Agent': 'Gaming-District-Discord-Bot/1.0' };
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
		? ` ~~${entry.regularPrice.toLocaleString('en-US')}~~`
		: '';
	return `**${entry.price.toLocaleString('en-US')} V-Bucks**${discount}`;
}

function buildShopEmbeds(shop) {
	return shop.entries.map((entry, index) => {
		const embed = new EmbedBuilder()
			.setColor(index === 0 ? 0x55d6ff : 0x1f8fff)
			.setTitle(entry.name.slice(0, 256))
			.setDescription([
				priceText(entry),
				entry.section ? `Shop section · ${entry.section}` : null,
				entry.items > 1 ? `Bundle with ${entry.items} items` : null,
				entry.banner,
			].filter(Boolean).join('\n').slice(0, 4096));
		if (entry.image && /^https:\/\//.test(entry.image)) embed.setThumbnail(entry.image);
		embed.setFooter({
			text: `${entry.category || 'Item Shop'} · View only · Not for sale through Discord`,
		});
		return embed;
	});
}

function messagePayloads(shop) {
	const payloads = [];
	const entries = sortEntries(shop.entries.map(entry => ({ ...entry, category: entry.category || 'Other' })));
	const groups = new Map();
	for (const entry of entries) {
		if (!groups.has(entry.category)) groups.set(entry.category, []);
		groups.get(entry.category).push(entry);
	}
	let firstMessage = true;
	for (const [category, categoryEntries] of groups) {
		const pages = Math.ceil(categoryEntries.length / EMBEDS_PER_MESSAGE);
		for (let index = 0; index < categoryEntries.length; index += EMBEDS_PER_MESSAGE) {
			const page = Math.floor(index / EMBEDS_PER_MESSAGE) + 1;
			payloads.push({
				content: [
					firstMessage ? `# ✨ New in the Fortnite Item Shop\nUp to 10 new offers · checked <t:${Math.floor(Date.now() / 1000)}:R>\n` : null,
					`## ${category} · ${categoryEntries.length}`,
					pages > 1 ? `Page ${page} of ${pages}` : null,
				].filter(Boolean).join('\n'),
				embeds: buildShopEmbeds({ ...shop, entries: categoryEntries.slice(index, index + EMBEDS_PER_MESSAGE) }),
				components: [],
			});
			firstMessage = false;
		}
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
	await savePanel(guild.id, channel.id, messageIds, `${currentShop.hash}:${FORMAT_VERSION}`);
	return { offers: currentShop.entries.length, messages: messageIds.length };
}

async function refreshFortniteShop(guild, shop = null) {
	const panel = await getPanel(guild.id);
	if (!panel) return null;
	const currentShop = shop || await fetchShop();
	if (panel.shop_hash === `${currentShop.hash}:${FORMAT_VERSION}`) {
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
	categoryFor,
	fetchShop,
	messagePayloads,
	normalizeShop,
	newestEntries,
	publishShop,
	refreshAllFortniteShops,
	refreshFortniteShop,
	sortEntries,
};
