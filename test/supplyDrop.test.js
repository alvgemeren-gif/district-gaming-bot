const test = require('node:test');
const assert = require('node:assert/strict');
const command = require('../commands/supply-drop/supply-drop');

test('every supply drop rarity contains all reward types', () => {
	for (const reward of Object.values(command.RARITIES)) {
		assert.ok(reward.xp > 0);
		assert.ok(reward.points > 0);
		assert.ok(reward.minutes > 0);
		assert.ok(reward.keys > 0);
	}
});

test('automatic rarity selection follows the configured boundaries', () => {
	assert.equal(command.randomRarity(() => 0), 'common');
	assert.equal(command.randomRarity(() => 0.50), 'rare');
	assert.equal(command.randomRarity(() => 0.99), 'mythic');
});
