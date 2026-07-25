const { EmbedBuilder } = require('discord.js');
const { pool, requireDatabase } = require('./scoreStore');

const NEWS_URL = 'https://fortnite-api.com/v2/news/br?lang=en';
const BUILD_URL = 'https://fortnite-api.com/v2/aes';
let schemaPromise;
let refreshPromise;

async function ensureSchema() {
	await requireDatabase();
	if (!schemaPromise) {
		schemaPromise = pool.query(`
			CREATE TABLE IF NOT EXISTS fortnite_update_feeds (
				guild_id TEXT PRIMARY KEY,
				channel_id TEXT NOT NULL,
				mention_role_id TEXT,
				seen_news_ids TEXT[] NOT NULL DEFAULT '{}',
				last_build TEXT,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
		`);
	}
	return schemaPromise;
}

function apiHeaders() {
	const headers = { 'User-Agent': 'Cozy-Hotel-Discord-Bot/1.0' };
	if (process.env.FORTNITE_API_KEY) headers.Authorization = process.env.FORTNITE_API_KEY;
	return headers;
}

async function fetchJson(url) {
	const response = await fetch(url, { headers: apiHeaders(), signal: AbortSignal.timeout(15_000) });
	if (!response.ok) throw new Error(`Fortnite API returned ${response.status}.`);
	const payload = await response.json();
	if (payload.status && payload.status !== 200) throw new Error(payload.error || 'Fortnite API rejected the request.');
	return payload.data;
}

function normalizeNews(data) {
	return (data?.motds || [])
		.filter(item => !item.hidden && item.id && item.title)
		.sort((left, right) => Number(right.sortingPriority || 0) - Number(left.sortingPriority || 0))
		.map(item => ({
			id: item.id,
			title: item.title,
			body: item.body || 'Er is een nieuwe Fortnite-update beschikbaar.',
			image: item.image || item.tileImage || null,
		}));
}

function versionFromBuild(build = '') {
	const match = String(build).match(/Release-(\d+\.\d+)/i);
	return match ? `v${match[1]}` : String(build).replace(/^\+\+Fortnite\+Release-/, '').split('-CL-')[0] || 'nieuwe versie';
}

async function fetchUpdates() {
	const [newsData, aesData] = await Promise.all([fetchJson(NEWS_URL), fetchJson(BUILD_URL)]);
	return {
		news: normalizeNews(newsData),
		build: aesData?.build || null,
		version: versionFromBuild(aesData?.build),
	};
}

function newsEmbed(item) {
	const embed = new EmbedBuilder()
		.setColor(0x8b5cf6)
		.setAuthor({ name: 'FORTNITE GAME UPDATE' })
		.setTitle(item.title.slice(0, 256))
		.setDescription(item.body.slice(0, 4096))
		.setTimestamp()
		.setFooter({ text: 'Automatisch gevolgd · Fortnite in-game nieuws' });
	if (item.image && /^https:\/\//.test(item.image)) embed.setImage(item.image);
	return embed;
}

function buildEmbed(build, version) {
	return new EmbedBuilder()
		.setColor(0x22d3ee)
		.setAuthor({ name: 'FORTNITE PATCH GEDETECTEERD' })
		.setTitle(`Fortnite ${version} is beschikbaar`)
		.setDescription(`De actieve Fortnite-gamebuild is gewijzigd.\n\n\`${String(build).slice(0, 180)}\``)
		.setTimestamp()
		.setFooter({ text: 'Versie automatisch gecontroleerd via de Fortnite build-feed' });
}

async function getFeed(guildId) {
	await ensureSchema();
	const result = await pool.query(
		`SELECT guild_id, channel_id, mention_role_id, seen_news_ids, last_build, updated_at
		 FROM fortnite_update_feeds WHERE guild_id = $1`,
		[guildId]
	);
	return result.rows[0] || null;
}

async function getFeeds() {
	await ensureSchema();
	const result = await pool.query(
		'SELECT guild_id, channel_id, mention_role_id, seen_news_ids, last_build, updated_at FROM fortnite_update_feeds'
	);
	return result.rows;
}

async function saveFeed(guildId, channelId, roleId, newsIds, build) {
	await ensureSchema();
	await pool.query(
		`INSERT INTO fortnite_update_feeds
		   (guild_id, channel_id, mention_role_id, seen_news_ids, last_build)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (guild_id) DO UPDATE SET
		   channel_id = EXCLUDED.channel_id,
		   mention_role_id = EXCLUDED.mention_role_id,
		   seen_news_ids = EXCLUDED.seen_news_ids,
		   last_build = EXCLUDED.last_build,
		   updated_at = NOW()`,
		[guildId, channelId, roleId, newsIds.slice(-500), build]
	);
}

function mentionPayload(roleId, initial) {
	if (!roleId || initial) return { content: null, allowedMentions: { parse: [] } };
	return { content: `<@&${roleId}>`, allowedMentions: { roles: [roleId] } };
}

async function publishCurrentUpdates(guild, channel, roleId = null) {
	const updates = await fetchUpdates();
	await channel.send({
		content: '## 📡 Fortnite Game Updates\nNieuwe Fortnite-content en gameversies verschijnen automatisch in dit kanaal.',
		allowedMentions: { parse: [] },
	});
	for (const item of updates.news) {
		await channel.send({ embeds: [newsEmbed(item)], allowedMentions: { parse: [] } });
	}
	await saveFeed(guild.id, channel.id, roleId, updates.news.map(item => item.id), updates.build);
	return { news: updates.news.length, version: updates.version };
}

async function refreshFortniteUpdates(guild, updates = null) {
	const feed = await getFeed(guild.id);
	if (!feed) return null;
	const channel = await guild.channels.fetch(feed.channel_id).catch(() => null);
	if (!channel?.isTextBased()) return null;
	const current = updates || await fetchUpdates();
	const seen = new Set(feed.seen_news_ids || []);
	const newItems = current.news.filter(item => !seen.has(item.id));
	const buildChanged = Boolean(feed.last_build && current.build && feed.last_build !== current.build);
	const mention = mentionPayload(feed.mention_role_id, false);
	const quiet = mentionPayload(null, false);
	let notificationSent = false;

	if (buildChanged) {
		await channel.send({ ...mention, embeds: [buildEmbed(current.build, current.version)] });
		notificationSent = true;
	}
	for (const item of newItems.reverse()) {
		await channel.send({ ...(notificationSent ? quiet : mention), embeds: [newsEmbed(item)] });
		notificationSent = true;
	}
	if (buildChanged || newItems.length) {
		await saveFeed(
			guild.id,
			feed.channel_id,
			feed.mention_role_id,
			[...(feed.seen_news_ids || []), ...newItems.map(item => item.id)],
			current.build
		);
	}
	return { news: newItems.length, buildChanged };
}

async function refreshAllFortniteUpdates(client) {
	if (refreshPromise) return refreshPromise;
	refreshPromise = (async () => {
		const feeds = await getFeeds();
		if (!feeds.length) return;
		const updates = await fetchUpdates();
		for (const feed of feeds) {
			const guild = client.guilds.cache.get(feed.guild_id);
			if (guild) {
				await refreshFortniteUpdates(guild, updates).catch(error => {
					console.error(`Could not refresh Fortnite updates for guild ${guild.id}:`, error);
				});
			}
		}
	})().finally(() => { refreshPromise = null; });
	return refreshPromise;
}

module.exports = {
	buildEmbed,
	fetchUpdates,
	newsEmbed,
	normalizeNews,
	publishCurrentUpdates,
	refreshAllFortniteUpdates,
	refreshFortniteUpdates,
	versionFromBuild,
};
