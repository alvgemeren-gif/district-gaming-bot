const crypto = require('crypto');
const axios = require('axios');
const { verifyScreenshot } = require('./victoryVerifier');

const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;

function send(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		'Content-Type': 'application/json; charset=utf-8',
		'Cache-Control': 'no-store',
		'X-Content-Type-Options': 'nosniff',
	});
	res.end(payload);
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

function safeEqual(left, right) {
	const a = Buffer.from(String(left || ''));
	const b = Buffer.from(String(right || ''));
	return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isAuthorized(req) {
	const token = process.env.VICTORY_VERIFICATION_TOKEN;
	if (!token) {
		return true;
	}
	const header = req.headers.authorization || '';
	const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
	return safeEqual(provided, token);
}

function createVictoryVerifierHandler() {
	return async (req, res) => {
		const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

		if (url.pathname !== '/verify') {
			return false;
		}

		if (req.method !== 'POST') {
			send(res, 405, { error: 'Method not allowed.' });
			return true;
		}

		if (!isAuthorized(req)) {
			send(res, 401, { error: 'Invalid verification token.' });
			return true;
		}

		try {
			const body = await readBody(req);
			const screenshotUrl = body.screenshotUrl;

			if (!screenshotUrl || typeof screenshotUrl !== 'string') {
				send(res, 400, { error: 'screenshotUrl is required.' });
				return true;
			}

			const download = await axios.get(screenshotUrl, {
				responseType: 'arraybuffer',
				timeout: 15000,
				maxContentLength: MAX_SCREENSHOT_BYTES,
				maxBodyLength: MAX_SCREENSHOT_BYTES,
			});
			const imageBuffer = Buffer.from(download.data);
			const mime = download.headers?.['content-type'] || 'image/jpeg';

			const result = await verifyScreenshot({ imageBuffer, mime });
			send(res, 200, result);
		} catch (error) {
			console.error('Victory verifier endpoint failed:', error.message);
			send(res, 502, {
				isVictory: false,
				kills: 0,
				crownVictory: false,
				confidence: null,
				reason: 'Verification failed.',
			});
		}

		return true;
	};
}

module.exports = { createVictoryVerifierHandler };
