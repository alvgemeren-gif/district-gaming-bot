const assert = require('node:assert/strict');
const test = require('node:test');
const { calculatePoints } = require('../utils/score');

test('kills award points without a Victory Royale', () => {
	assert.equal(calculatePoints(7, false), 7);
});

test('a Victory Royale adds ten bonus points to the kills', () => {
	assert.equal(calculatePoints(7, true), 17);
});

test('zero kills and no Victory Royale awards zero points', () => {
	assert.equal(calculatePoints(0, false), 0);
});

test('a Crown Victory adds five points on top of a Victory Royale', () => {
	assert.equal(calculatePoints(7, true, true), 22);
});

test('a Crown Victory cannot be awarded without a Victory Royale', () => {
	assert.throws(() => calculatePoints(7, false, true), /requires a Victory Royale/);
});
