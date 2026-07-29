const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
	approveSubmission,
	getDashboardSubmissions,
	getSubmission,
	getVerificationAccuracy,
	rejectSubmission,
	AI_AUTO_ACTOR,
} = require('./scoreStore');
const { refreshLiveScoreboard } = require('./liveScoreboard');
const { refreshLivePlayerLeaderboard } = require('./livePlayerLeaderboard');

const publicDirectory = path.join(__dirname, '..', 'public', 'admin');
const sessionCookie = 'cozy_admin';

function parseCookies(header = '') {
	return Object.fromEntries(header.split(';').map(value => {
		const [key, ...parts] = value.trim().split('=');
		return [key, decodeURIComponent(parts.join('='))];
	}).filter(([key]) => key));
}

function signature(secret) {
	return crypto.createHmac('sha256', secret).update('cozy-hotel-admin-v1').digest('hex');
}

function safeEqual(left, right) {
	const a = Buffer.from(String(left || ''));
	const b = Buffer.from(String(right || ''));
	return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isAuthenticated(req, secret) {
	return Boolean(secret) && safeEqual(parseCookies(req.headers.cookie)[sessionCookie], signature(secret));
}

function send(res, status, body, contentType = 'application/json; charset=utf-8', headers = {}) {
	res.writeHead(status, {
		'Content-Type': contentType,
		'Cache-Control': 'no-store',
		'X-Content-Type-Options': 'nosniff',
		'X-Frame-Options': 'DENY',
		'Referrer-Policy': 'same-origin',
		...headers,
	});
	res.end(contentType.startsWith('application/json') ? JSON.stringify(body) : body);
}

async function readBody(req) {
	let body = '';
	for await (const chunk of req) {
		body += chunk;
		if (body.length > 100_000) {
			throw new Error('Request is too large.');
		}
	}
	return body ? JSON.parse(body) : {};
}

function serveFile(res, filename, contentType) {
	const file = path.join(publicDirectory, filename);
	send(res, 200, fs.readFileSync(file), contentType);
}

function dashboardGuilds(client) {
	return [...client.guilds.cache.values()].map(guild => ({
		id: guild.id,
		name: guild.name,
	}));
}

async function enrichSubmission(client, submission) {
	const guild = client.guilds.cache.get(submission.guild_id);
	const member = guild
		? await guild.members.fetch(submission.user_id).catch(() => null)
		: null;
	const role = guild?.roles.cache.get(submission.district_role_id);

	return {
		...submission,
		screenshot_hash: undefined,
		has_screenshot: Boolean(submission.screenshot_hash),
		player_name: member?.displayName || member?.user?.username || submission.user_id,
		district_name: role?.name || submission.district_role_id,
		auto_approved: submission.reviewed_by === AI_AUTO_ACTOR,
		ai_disagrees_with_player: submission.ai_predicted_victory !== null
			&& submission.ai_predicted_victory !== submission.claimed_victory,
	};
}

function sameOrigin(req) {
	const origin = req.headers.origin;
	return !origin || origin === `https://${req.headers.host}` || origin === `http://${req.headers.host}`;
}

function createAdminDashboardHandler(client) {
	return async (req, res) => {
		const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
		const secret = process.env.ADMIN_DASHBOARD_TOKEN;

		try {
			if (url.pathname === '/') {
				send(res, 200, 'The bot and moderation dashboard are online.', 'text/plain; charset=utf-8');
				return;
			}

			if (url.pathname === '/admin/login' && req.method === 'POST') {
				const body = await readBody(req);
				if (!secret || !safeEqual(body.token, secret)) {
					send(res, 401, { error: 'Invalid administrator code.' });
					return;
				}
				send(res, 200, { ok: true }, undefined, {
					'Set-Cookie': `${sessionCookie}=${signature(secret)}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=86400${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
				});
				return;
			}

			if (url.pathname === '/admin/login') {
				serveFile(res, 'login.html', 'text/html; charset=utf-8');
				return;
			}

			if (!url.pathname.startsWith('/admin')) {
				send(res, 404, { error: 'Not found.' });
				return;
			}

			if (!isAuthenticated(req, secret)) {
				if (url.pathname.startsWith('/admin/api/')) {
					send(res, 401, { error: 'Please log in again.' });
				} else {
					res.writeHead(302, { Location: '/admin/login' });
					res.end();
				}
				return;
			}

			if (req.method === 'POST' && !sameOrigin(req)) {
				send(res, 403, { error: 'Invalid request.' });
				return;
			}

			if (url.pathname === '/admin') {
				serveFile(res, 'index.html', 'text/html; charset=utf-8');
				return;
			}
			if (url.pathname === '/admin/app.css') {
				serveFile(res, 'app.css', 'text/css; charset=utf-8');
				return;
			}
			if (url.pathname === '/admin/app.js') {
				serveFile(res, 'app.js', 'text/javascript; charset=utf-8');
				return;
			}
			if (url.pathname === '/admin/api/guilds') {
				send(res, 200, { guilds: dashboardGuilds(client) });
				return;
			}
			if (url.pathname === '/admin/api/submissions' && req.method === 'GET') {
				const guildId = url.searchParams.get('guildId');
				const status = url.searchParams.get('status') || 'all';
				if (!client.guilds.cache.has(guildId) || !['all', 'pending', 'approved', 'rejected', 'removed'].includes(status)) {
					send(res, 400, { error: 'Invalid server or status.' });
					return;
				}
				const rows = await getDashboardSubmissions(guildId, status);
				const accuracy = await getVerificationAccuracy(guildId).catch(() => null);
				send(res, 200, {
					submissions: await Promise.all(rows.map(row => enrichSubmission(client, row))),
					aiStats: accuracy && {
						...accuracy,
						minSample: Number(process.env.AI_AUTO_APPROVE_MIN_SAMPLE) || 50,
						minAccuracy: Number(process.env.AI_AUTO_APPROVE_MIN_ACCURACY) || 0.99,
					},
				});
				return;
			}

			const screenshotMatch = url.pathname.match(/^\/admin\/api\/submissions\/(\d+)\/screenshot$/);
			if (screenshotMatch && req.method === 'GET') {
				const guildId = url.searchParams.get('guildId');
				const submission = await getSubmission(guildId, screenshotMatch[1]);
				if (!submission?.screenshot_data) {
					send(res, 404, { error: 'No screenshot found.' });
					return;
				}
				send(res, 200, submission.screenshot_data, submission.screenshot_mime || 'image/jpeg');
				return;
			}

			const actionMatch = url.pathname.match(/^\/admin\/api\/submissions\/(\d+)\/(approve|reject)$/);
			if (actionMatch && req.method === 'POST') {
				const [, submissionId, action] = actionMatch;
				const body = await readBody(req);
				const guild = client.guilds.cache.get(body.guildId);
				const current = guild ? await getSubmission(body.guildId, submissionId) : null;
				if (!current) {
					send(res, 404, { error: 'Submission not found.' });
					return;
				}
				const actor = process.env.ADMIN_ACTOR_ID || 'web-dashboard';
				const updated = action === 'approve'
					? await approveSubmission(
						body.guildId,
						submissionId,
						actor,
						Number(body.kills),
						Boolean(body.victory),
						body.note || null,
						'dashboard_approved',
						Boolean(body.crownVictory)
					)
					: await rejectSubmission(body.guildId, submissionId, actor, body.note || 'Rejected through the dashboard.');
				await refreshLiveScoreboard(guild).catch(error => {
					console.error('Live scoreboard refresh failed:', error);
				});
				await refreshLivePlayerLeaderboard(guild).catch(error => {
					console.error('Live member leaderboard refresh failed:', error);
				});
				send(res, 200, { submission: await enrichSubmission(client, updated) });
				return;
			}

			send(res, 404, { error: 'Not found.' });
		} catch (error) {
			console.error('Admin dashboard error:', error);
			send(res, 500, { error: error.message || 'The action failed.' });
		}
	};
}

module.exports = { createAdminDashboardHandler };
