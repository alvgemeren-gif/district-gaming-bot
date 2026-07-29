const test = require('node:test');
const assert = require('node:assert/strict');
const { createDropQuizHandler, normalizePoi } = require('../utils/dropQuiz');

function response() {
	return {
		status: null,
		headers: null,
		body: null,
		writeHead(status, headers) { this.status = status; this.headers = headers; },
		end(body) { this.body = body; },
	};
}

test('normalizes Fortnite world coordinates to map percentages', () => {
	assert.deepEqual(normalizePoi({ name: 'Center', location: { x: 0, y: 0 } }), { name: 'Center', x: .5, y: .5 });
	const corner = normalizePoi({ name: 'Corner', location: { x: -135000, y: 135000 } });
	assert.equal(corner.x, 0);
	assert.equal(corner.y, 0);
});

test('serves a playable OG map with named locations', async () => {
	const handler = createDropQuizHandler();
	const res = response();
	assert.equal(await handler({ url: '/dropquiz/api/map?mode=og', method: 'GET', headers: { host: 'localhost' } }, res), true);
	assert.equal(res.status, 200);
	const data = JSON.parse(res.body);
	assert.equal(data.mode, 'og');
	assert.match(data.version, /Season 8/);
	assert.ok(data.pois.length >= 20);
	assert.ok(data.pois.some(poi => poi.name === 'Tilted Towers'));
});

test('ignores requests outside the drop quiz route', async () => {
	const handler = createDropQuizHandler();
	assert.equal(await handler({ url: '/city', method: 'GET', headers: { host: 'localhost' } }, response()), false);
});
