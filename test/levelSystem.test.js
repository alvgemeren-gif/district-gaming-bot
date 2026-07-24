const assert = require('node:assert/strict');
const test = require('node:test');
const { levelFromXp, xpForLevel } = require('../utils/levelSystem');

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
