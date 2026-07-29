const fs = require('fs');
const https = require('https');
const path = require('path');

const assets = path.join(__dirname, '..', 'public', 'dropquiz');
const MAP_API = 'https://fortnite-api.com/v1/map';
const cache = { data: null, expires: 0 };

const OG_POIS = [
	['Junk Junction', .22, .17], ['Haunted Hills', .27, .27], ['Pleasant Park', .34, .34],
	['Lazy Lagoon', .55, .18], ['Sunny Steps', .71, .20], ['The Block', .45, .25],
	['Loot Lake', .44, .40], ['Tilted Towers', .43, .49], ['Dusty Divot', .58, .46],
	['Retail Row', .70, .47], ['Lonely Lodge', .79, .38], ['Snobby Shores', .19, .44],
	['Greasy Grove', .29, .61], ['Shifty Shafts', .40, .63], ['Salty Springs', .51, .59],
	['Fatal Fields', .54, .72], ['Lucky Landing', .52, .84], ['Frosty Flights', .20, .69],
	['Polar Peak', .31, .70], ['Happy Hamlet', .31, .82], ['Paradise Palms', .73, .70],
	['Mega Mall', .70, .51], ['Pressure Plant', .72, .28],
].map(([name, x, y]) => ({ name, x, y }));

function send(res, status, body, type, headers = {}) {
	res.writeHead(status, {
		'Content-Type': type,
		'Cache-Control': type.startsWith('application/json') ? 'public, max-age=300' : 'public, max-age=3600',
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'no-referrer',
		'Content-Security-Policy': "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; img-src 'self' https://fortnite-api.com data:; connect-src 'self'; frame-ancestors 'none'",
		...headers,
	});
	res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

function fetchJson(url) {
	return new Promise((resolve, reject) => {
		const request = https.get(url, { headers: { 'User-Agent': 'Cozy-Hotel-DropQuiz/1.0' }, timeout: 8000 }, response => {
			let body = '';
			response.on('data', chunk => { body += chunk; });
			response.on('end', () => {
				try {
					if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`Map API returned ${response.statusCode}`);
					resolve(JSON.parse(body));
				} catch (error) { reject(error); }
			});
		});
		request.on('timeout', () => request.destroy(new Error('Map API timeout')));
		request.on('error', reject);
	});
}

function normalizePoi(poi) {
	const x = Number(poi.location?.x);
	const y = Number(poi.location?.y);
	return { name: String(poi.name || '').trim(), x: (x + 135000) / 270000, y: (135000 - y) / 270000 };
}

async function currentMap() {
	if (cache.data && cache.expires > Date.now()) return cache.data;
	const result = await fetchJson(MAP_API);
	const raw = result.data?.pois || [];
	let pois = raw
		.filter(poi => /\.POI\./i.test(poi.id || '') && !/UnNamed/i.test(poi.id || ''))
		.map(normalizePoi)
		.filter(poi => poi.name && Number.isFinite(poi.x) && Number.isFinite(poi.y) && poi.x > 0 && poi.x < 1 && poi.y > 0 && poi.y < 1);
	if (pois.length < 4) {
		pois = raw.map(normalizePoi).filter(poi => poi.name && poi.x > 0 && poi.x < 1 && poi.y > 0 && poi.y < 1);
	}
	cache.data = {
		mode: 'br',
		live: true,
		version: 'Actuele Battle Royale-kaart',
		updatedAt: new Date().toISOString(),
		image: result.data?.images?.blank || 'https://fortnite-api.com/images/map.png',
		pois,
	};
	cache.expires = Date.now() + 15 * 60 * 1000;
	return cache.data;
}

function ogMap() {
	return {
		mode: 'og',
		live: false,
		version: 'OG Chapter 1 · Season 8',
		image: '/dropquiz/og-map.svg',
		pois: OG_POIS,
	};
}

function createDropQuizHandler() {
	return async (req, res) => {
		const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
		if (!url.pathname.startsWith('/dropquiz')) return false;
		try {
			if (url.pathname === '/dropquiz' || url.pathname === '/dropquiz/') {
				send(res, 200, fs.readFileSync(path.join(assets, 'index.html')), 'text/html; charset=utf-8');
				return true;
			}
			if (url.pathname === '/dropquiz/api/map' && req.method === 'GET') {
				const mode = url.searchParams.get('mode');
				if (!['br', 'og'].includes(mode)) {
					send(res, 400, { error: 'Kies Battle Royale of OG.' }, 'application/json; charset=utf-8');
					return true;
				}
				send(res, 200, mode === 'br' ? await currentMap() : ogMap(), 'application/json; charset=utf-8');
				return true;
			}
			const file = path.basename(url.pathname);
			const allowed = { 'app.css': 'text/css; charset=utf-8', 'app.js': 'text/javascript; charset=utf-8', 'og-map.svg': 'image/svg+xml' };
			if (allowed[file]) {
				send(res, 200, fs.readFileSync(path.join(assets, file)), allowed[file]);
				return true;
			}
			send(res, 404, { error: 'Niet gevonden.' }, 'application/json; charset=utf-8');
			return true;
		} catch (error) {
			console.error('Drop quiz error:', error);
			send(res, 503, { error: 'De live Fortnite-kaart is even niet bereikbaar.' }, 'application/json; charset=utf-8');
			return true;
		}
	};
}

module.exports = { createDropQuizHandler, normalizePoi };
