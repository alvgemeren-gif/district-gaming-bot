const assert = require('node:assert/strict');
const test = require('node:test');
const { levelFromXp, xpForLevel } = require('../utils/levelSystem');

test('level commands expose member and administrator actions', () => {
	const publicCommand = require('../commands/level/level').data.toJSON();
	const adminCommand = require('../commands/level-admin/level-admin').data.toJSON();

	assert.equal(publicCommand.name, 'level');
	assert.deepEqual(
		publicCommand.options.map(option => option.name),
		['rank', 'leaderboard', 'rewards']
	);
	assert.equal(adminCommand.name, 'level-admin');
	assert.equal(adminCommand.default_member_permissions, '8');
	assert.deepEqual(
		adminCommand.options.map(option => option.name),
		['reward-add', 'reward-remove', 'channel']
	);
});

test('level thresholds grow quadratically', () => {
	assert.equal(xpForLevel(0), 0);
	assert.equal(xpForLevel(1), 100);
	assert.equal(xpForLevel(2), 400);
	assert.equal(xpForLevel(10), 10000);
});

test('XP is converted to the correct level at boundaries', () => {
	assert.equal(levelFromXp(0), 0);
	assert.equal(levelFromXp(99), 0);
	assert.equal(levelFromXp(100), 1);
	assert.equal(levelFromXp(399), 1);
	assert.equal(levelFromXp(400), 2);
});
