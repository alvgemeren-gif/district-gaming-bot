const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getRoleConfig } = require('./roleChoiceStore');
const store = require('./cityGameStore');
const assets = path.join(__dirname, '..', 'public', 'city');
const buckets = new Map();

function secret() { return process.env.CITY_GAME_SECRET || process.env.DAILY_GAME_SECRET || process.env.ADMIN_DASHBOARD_TOKEN; }
function sign(value) { return crypto.createHmac('sha256', secret()).update(value).digest('base64url'); }
function token(data) { const value = Buffer.from(JSON.stringify(data)).toString('base64url'); return `${value}.${sign(value)}`; }
function parse(value = '') {
	const [body, signature] = value.split('.');
	if (!body || !signature || !secret()) return null;
	const expected = sign(body);
	if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
	try { const data = JSON.parse(Buffer.from(body, 'base64url')); return data.exp > Date.now() ? data : null; } catch { return null; }
}
function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map(part => { const [key, ...value] = part.trim().split('='); return [key, decodeURIComponent(value.join('='))]; }).filter(([key]) => key)); }
function send(res, status, body, type = 'application/json; charset=utf-8', headers = {}) {
	res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' https://cdn.discordapp.com data:; connect-src 'self'; frame-ancestors 'self' https://discord.com", ...headers });
	res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
async function body(req) { let data = ''; for await (const chunk of req) { data += chunk; if (data.length > 10000) throw Object.assign(new Error('Request too large.'), { status: 413 }); } return data ? JSON.parse(data) : {}; }
function rateLimit(id) { const now = Date.now(); const current = (buckets.get(id) || []).filter(time => now - time < 60000); if (current.length >= 40) throw Object.assign(new Error('Slow down and try again.'), { status: 429 }); current.push(now); buckets.set(id, current); }
async function identity(client, session) {
	const guildId = process.env.DISCORD_GUILD_ID || process.env.GUILD_ID;
	const guild = client.guilds.cache.get(guildId);
	const configured = await getRoleConfig(guildId);
	if (!configured?.length) throw Object.assign(new Error('The five district roles have not been configured by an administrator yet.'), { status: 503 });
	if (!configured.includes(session.team)) throw Object.assign(new Error('TEAM_REQUIRED'), { status: 401 });
	return {
		guildId,
		userId: session.id,
		username: session.username || 'Commander',
		avatar: null,
		districtRoleId: session.team,
		districtName: guild?.roles.cache.get(session.team)?.name || 'Team',
	};
}
async function decorate(client, who, row, offline, reward) {
	const board = await store.leaderboard(who.guildId);
	const guild = client.guilds.cache.get(who.guildId);
	for (const district of board) district.name = guild?.roles.cache.get(district.roleId)?.name || 'District';
	return { player: { username: who.username, avatar: who.avatar }, connection: { discord: client.isReady() ? 'live' : 'cached', serverTime: new Date().toISOString() }, state: store.publicState(row, offline, who.districtName, board), reward };
}
function createCityGameHandler(client) {
	return async (req, res) => {
		const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
		if (!url.pathname.startsWith('/city')) return false;
		try {
			if (!secret()) throw Object.assign(new Error('CITY_GAME_SECRET is not configured.'), { status: 503 });
			if (url.pathname === '/city/logout') {
				res.writeHead(302, { Location: '/city', 'Set-Cookie': `cozy_city=; Path=/city; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` }); res.end(); return true;
			}
			if (url.pathname === '/city' || url.pathname === '/city/') { send(res, 200, fs.readFileSync(path.join(assets, 'index.html')), 'text/html; charset=utf-8'); return true; }
			if (['/city/app.css', '/city/app.js'].includes(url.pathname)) { const file = path.basename(url.pathname); send(res, 200, fs.readFileSync(path.join(assets, file)), file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8'); return true; }
			if (url.pathname === '/city/api/health' && req.method === 'GET') {
				send(res, 200, { ok: true, discord: client.isReady() ? 'connected' : 'reconnecting', time: new Date().toISOString() }); return true;
			}
			if (url.pathname === '/city/api/teams' && req.method === 'GET') {
				const guildId = process.env.DISCORD_GUILD_ID || process.env.GUILD_ID;
				const configured = await getRoleConfig(guildId);
				const guild = client.guilds.cache.get(guildId);
				send(res, 200, { teams: configured.map(id => ({ id, name: guild?.roles.cache.get(id)?.name || 'Team' })) }); return true;
			}
			if (url.pathname === '/city/api/join' && req.method === 'POST') {
				const origin = req.headers.origin;
				if (origin && new URL(origin).host !== req.headers.host) throw Object.assign(new Error('Invalid origin.'), { status: 403 });
				const input = await body(req);
				const guildId = process.env.DISCORD_GUILD_ID || process.env.GUILD_ID;
				const configured = await getRoleConfig(guildId);
				if (!configured.includes(String(input.team || ''))) throw Object.assign(new Error('Choose a valid team.'), { status: 400 });
				const session = token({ id: crypto.randomUUID(), username: 'Commander', team: String(input.team), exp: Date.now() + 31536000000 });
				send(res, 200, { ok: true }, 'application/json; charset=utf-8', { 'Set-Cookie': `cozy_city=${session}; Path=/city; HttpOnly; SameSite=Lax; Max-Age=31536000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` }); return true;
			}
			const session = parse(cookies(req).cozy_city);
			if (!session?.team) throw Object.assign(new Error('TEAM_REQUIRED'), { status: 401 });
			rateLimit(session.id);
			const who = await identity(client, session);
			if (url.pathname === '/city/api/state' && req.method === 'GET') {
				const result = await store.withPlayer(who, null);
				send(res, 200, await decorate(client, who, result.row, result.offline)); return true;
			}
			if (req.method === 'POST') {
				const origin = req.headers.origin;
				if (origin && new URL(origin).host !== req.headers.host) throw Object.assign(new Error('Invalid origin.'), { status: 403 });
				const input = await body(req); let result;
				if (url.pathname === '/city/api/upgrade') result = { row: await store.upgrade(who, input.key) };
				else if (url.pathname === '/city/api/research') result = { row: await store.research(who, input.key) };
				else if (url.pathname === '/city/api/daily') result = await store.daily(who);
				else if (url.pathname === '/city/api/rename') result = { row: await store.rename(who, input.name) };
				else throw Object.assign(new Error('Not found.'), { status: 404 });
				send(res, 200, await decorate(client, who, result.row, null, result.reward)); return true;
			}
			throw Object.assign(new Error('Not found.'), { status: 404 });
		} catch (error) { console.error('City game error:', error); send(res, error.status || 500, { error: error.message || 'Game temporarily unavailable.' }); return true; }
	};
}
module.exports = { createCityGameHandler };
