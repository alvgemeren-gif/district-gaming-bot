const test = require('node:test');
const assert = require('node:assert/strict');
const { BUILDINGS, RESEARCH, upgradeCost, upgradeSeconds } = require('../utils/cityGameContent');

test('city content includes a complete starter loop and late-game district building', () => {
	assert.equal(BUILDINGS.house.unlock, 0);
	assert.ok(BUILDINGS.house.production.coins > 0);
	assert.ok(BUILDINGS.lumber.production.materials > 0);
	assert.ok(BUILDINGS.wind.production.energy > 0);
	assert.ok(BUILDINGS.hq.power > BUILDINGS.house.power);
	assert.equal(Object.keys(RESEARCH).length, 6);
});

test('building costs and timers scale indefinitely', () => {
	assert.ok(upgradeCost('house', 20).coins > upgradeCost('house', 1).coins);
	assert.ok(upgradeSeconds('house', 20) > upgradeSeconds('house', 1));
	assert.ok(upgradeSeconds('house', 10, ['construction']) < upgradeSeconds('house', 10));
});
