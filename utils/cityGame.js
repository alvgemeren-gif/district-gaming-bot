const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getRoleChoice, getRoleConfig } = require('./roleChoiceStore');
const store = require('./cityGameStore');
const assets = path.join(__dirname, '..', 'public', 'city');
const buckets = new Map();

function baseUrl() { return (process.env.CITY_GAME_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, ''); }
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
	res.writeHead(status, { 'Content-Type': type, 'Cache-Control': type.startsWith('text/') ? 'public, max-age=300' : 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' https://cdn.discordapp.com data:; connect-src 'self'; frame-ancestors 'self' https://discord.com", ...headers });
	res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
async function body(req) { let data = ''; for await (const chunk of req) { data += chunk; if (data.length > 10000) throw Object.assign(new Error('Request too large.'), { status: 413 }); } return data ? JSON.parse(data) : {}; }
function rateLimit(id) { const now = Date.now(); const current = (buckets.get(id) || []).filter(time => now - time < 60000); if (current.length >= 40) throw Object.assign(new Error('Slow down and try again.'), { status: 429 }); current.push(now); buckets.set(id, current); }
async function identity(client, session) {
	const guildId = process.env.DISCORD_GUILD_ID || process.env.GUILD_ID;
	const guild = client.guilds.cache.get(guildId);
	if (!guild) throw Object.assign(new Error('Discord server is unavailable.'), { status: 503 });
	const [choice, configured, member] = await Promise.all([getRoleChoice(guildId, session.id), getRoleConfig(guildId), guild.members.fetch(session.id).catch(() => null)]);
	if (!choice || !configured?.includes(choice.role_id) || !member?.roles.cache.has(choice.role_id)) throw Object.assign(new Error('Choose a valid district role in Discord first.'), { status: 403 });
	return { guildId, userId: session.id, username: session.username, avatar: session.avatar, districtRoleId: choice.role_id, districtName: guild.roles.cache.get(choice.role_id)?.name || 'District' };
}
async function exchange(code) {
	const response = await fetch('https://discord.com/api/v10/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: `${baseUrl()}/city/auth/callback` }) });
	if (!response.ok) throw Object.assign(new Error('Discord sign-in failed.'), { status: 401 });
	const oauth = await response.json();
	const profile = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${oauth.access_token}` } });
	if (!profile.ok) throw Object.assign(new Error('Could not read your Discord profile.'), { status: 401 });
	return profile.json();
}
async function decorate(client, who, row, offline, reward) {
	const board = await store.leaderboard(who.guildId);
	const guild = client.guilds.cache.get(who.guildId);
	for (const district of board) district.name = guild?.roles.cache.get(district.roleId)?.name || 'District';
	return { player: { username: who.username, avatar: who.avatar }, state: store.publicState(row, offline, who.districtName, board), reward };
}
function createCityGameHandler(client) {
	return async (req, res) => {
		const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
		if (!url.pathname.startsWith('/city')) return false;
		try {
			if (!secret()) throw Object.assign(new Error('CITY_GAME_SECRET is not configured.'), { status: 503 });
			if (url.pathname === '/city/auth') {
				if (!baseUrl() || !process.env.DISCORD_CLIENT_SECRET) throw Object.assign(new Error('Discord OAuth is not configured.'), { status: 503 });
				const state = token({ type: 'oauth', exp: Date.now() + 600000 });
				const target = new URL('https://discord.com/oauth2/authorize');
				target.search = new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID, redirect_uri: `${baseUrl()}/city/auth/callback`, response_type: 'code', scope: 'identify', state });
				res.writeHead(302, { Location: target.toString(), 'Set-Cookie': `city_oauth=${state}; Path=/city; HttpOnly; SameSite=Lax; Max-Age=600${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` }); res.end(); return true;
			}
			if (url.pathname === '/city/auth/callback') {
				if (url.searchParams.get('error')) {
					res.writeHead(302, { Location: '/city?login=cancelled' }); res.end(); return true;
				}
				const state = parse(url.searchParams.get('state'));
				if (!state || state.type !== 'oauth' || cookies(req).city_oauth !== url.searchParams.get('state')) {
					res.writeHead(302, { Location: '/city?login=expired' }); res.end(); return true;
				}
				const user = await exchange(url.searchParams.get('code'));
				const avatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : null;
				const session = token({ id: user.id, username: user.global_name || user.username, avatar, exp: Date.now() + 604800000 });
				res.writeHead(302, { Location: '/city', 'Set-Cookie': `cozy_city=${session}; Path=/city; HttpOnly; SameSite=Lax; Max-Age=604800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` }); res.end(); return true;
			}
			if (url.pathname === '/city/logout') {
				res.writeHead(302, { Location: '/city', 'Set-Cookie': `cozy_city=; Path=/city; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` }); res.end(); return true;
			}
			if (url.pathname === '/city' || url.pathname === '/city/') { send(res, 200, fs.readFileSync(path.join(assets, 'index.html')), 'text/html; charset=utf-8'); return true; }
			if (['/city/app.css', '/city/app.js'].includes(url.pathname)) { const file = path.basename(url.pathname); send(res, 200, fs.readFileSync(path.join(assets, file)), file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8'); return true; }
			const session = parse(cookies(req).cozy_city);
			if (!session) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
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
