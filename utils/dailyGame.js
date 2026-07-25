const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getRoleChoice, getRoleConfig } = require('./roleChoiceStore');
const {
	getOrStartAttempt,
	leaderboards,
	publicAttempt,
	puzzleFor,
	submitAnswer,
} = require('./dailyGameStore');

const publicDirectory = path.join(__dirname, '..', 'public', 'daily');
const sessionCookie = 'cozy_daily';

function secret() {
	return process.env.DAILY_GAME_SECRET || process.env.ADMIN_DASHBOARD_TOKEN;
}

function sign(value) {
	return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

function token(payload) {
	const value = Buffer.from(JSON.stringify(payload)).toString('base64url');
	return `${value}.${sign(value)}`;
}

function parseToken(value = '') {
	const [payload, signature] = value.split('.');
	if (!payload || !signature) return null;
	const expected = sign(payload);
	if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
	const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
	return parsed.exp > Date.now() ? parsed : null;
}

function cookies(req) {
	return Object.fromEntries((req.headers.cookie || '').split(';').map(part => {
		const [key, ...value] = part.trim().split('=');
		return [key, decodeURIComponent(value.join('='))];
	}).filter(([key]) => key));
}

function send(res, status, body, type = 'application/json; charset=utf-8', headers = {}) {
	res.writeHead(status, {
		'Content-Type': type,
		'Cache-Control': 'no-store',
		'X-Content-Type-Options': 'nosniff',
		'X-Frame-Options': 'DENY',
		'Referrer-Policy': 'same-origin',
		'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' https://cdn.discordapp.com; connect-src 'self'; frame-ancestors 'none'",
		...headers,
	});
	res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

async function body(req) {
	let value = '';
	for await (const chunk of req) {
		value += chunk;
		if (value.length > 10_000) throw Object.assign(new Error('Request too large.'), { status: 413 });
	}
	return value ? JSON.parse(value) : {};
}

function createDailyLoginToken({ guildId, userId, username }) {
	if (!secret()) {
		throw new Error('DAILY_GAME_SECRET is not configured.');
	}
	return token({
		type: 'daily-login',
		guildId,
		id: userId,
		username,
		exp: Date.now() + (10 * 60 * 1000),
	});
}

async function playerContext(client, session) {
	const guildId = process.env.DISCORD_GUILD_ID || process.env.GUILD_ID;
	const guild = client.guilds.cache.get(guildId);
	if (!guild) throw Object.assign(new Error('The game server is unavailable.'), { status: 503 });
	const [choice, roles] = await Promise.all([getRoleChoice(guildId, session.id), getRoleConfig(guildId)]);
	if (!choice || !roles?.includes(choice.role_id)) {
		throw Object.assign(new Error('Choose a district in Discord before playing.'), { status: 403 });
	}
	return { guildId, districtRoleId: choice.role_id, districtName: guild.roles.cache.get(choice.role_id)?.name || 'District' };
}

function createDailyGameHandler(client) {
	return async (req, res) => {
		const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
		if (!url.pathname.startsWith('/daily')) return false;
		try {
			if (!secret()) throw Object.assign(new Error('Daily game authentication is not configured.'), { status: 503 });
			if (url.pathname === '/daily/login') {
				const login = parseToken(url.searchParams.get('token'));
				const configuredGuildId = process.env.DISCORD_GUILD_ID || process.env.GUILD_ID;
				if (!login || login.type !== 'daily-login' || login.guildId !== configuredGuildId) {
					throw Object.assign(new Error('This game link is invalid or has expired. Use /daily again in Discord.'), { status: 403 });
				}
				res.writeHead(302, {
					Location: '/daily',
					'Set-Cookie': `${sessionCookie}=${token({ id: login.id, username: login.username, exp: Date.now() + 604800000 })}; Path=/daily; HttpOnly; SameSite=Lax; Max-Age=604800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
				});
				res.end();
				return true;
			}
			if (url.pathname === '/daily' || url.pathname === '/daily/') {
				send(res, 200, fs.readFileSync(path.join(publicDirectory, 'index.html')), 'text/html; charset=utf-8');
				return true;
			}
			if (url.pathname === '/daily/app.css' || url.pathname === '/daily/app.js') {
				const filename = path.basename(url.pathname);
				send(res, 200, fs.readFileSync(path.join(publicDirectory, filename)), filename.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8');
				return true;
			}
			const session = parseToken(cookies(req)[sessionCookie]);
			if (!session) throw Object.assign(new Error('Sign in with Discord to play.'), { status: 401 });
			const context = await playerContext(client, session);
			if (url.pathname === '/daily/api/state' && req.method === 'GET') {
				const attempt = await getOrStartAttempt({ ...context, userId: session.id, username: session.username });
				const state = publicAttempt(attempt);
				const puzzle = state.completed ? null : puzzleFor(state.challengeKey, state.round);
				const ranks = await leaderboards(context.guildId, state.challengeKey);
				send(res, 200, { player: { username: session.username, district: context.districtName }, attempt: state, puzzle: puzzle && { ...puzzle, answer: undefined }, leaderboards: ranks });
				return true;
			}
			if (url.pathname === '/daily/api/answer' && req.method === 'POST') {
				const origin = req.headers.origin;
				if (origin && new URL(origin).host !== req.headers.host) throw Object.assign(new Error('Invalid request origin.'), { status: 403 });
				const input = await body(req);
				const result = await submitAnswer({ ...context, userId: session.id, answer: input.answer });
				const state = publicAttempt(result.row);
				const puzzle = state.completed ? null : puzzleFor(state.challengeKey, state.round);
				send(res, 200, { correct: result.correct, attempt: state, puzzle: puzzle && { ...puzzle, answer: undefined } });
				return true;
			}
			throw Object.assign(new Error('Not found.'), { status: 404 });
		} catch (error) {
			console.error('Daily game error:', error);
			send(res, error.status || 500, { error: error.message || 'The game is temporarily unavailable.' });
			return true;
		}
	};
}

module.exports = { createDailyGameHandler, createDailyLoginToken };
