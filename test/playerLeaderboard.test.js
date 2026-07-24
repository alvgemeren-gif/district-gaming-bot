const assert = require('node:assert/strict');
const test = require('node:test');
const { formatPlayerRanking } = require('../utils/livePlayerLeaderboard');

test('player rankings sort independently by wins and kills', () => {
	const rows = [
		{ user_id: '1', victories: 2, kills: 20 },
		{ user_id: '2', victories: 5, kills: 10 },
	];

	assert.ok(formatPlayerRanking(rows, 'victories').indexOf('<@2>') < formatPlayerRanking(rows, 'victories').indexOf('<@1>'));
	assert.ok(formatPlayerRanking(rows, 'kills').indexOf('<@1>') < formatPlayerRanking(rows, 'kills').indexOf('<@2>'));
});
