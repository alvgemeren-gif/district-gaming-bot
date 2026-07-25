const test = require('node:test');
const assert = require('node:assert/strict');
const { puzzleFor } = require('../utils/dailyGameStore');

test('daily puzzles are deterministic and never expose an invalid answer', () => {
	for (let round = 0; round < 5; round += 1) {
		const first = puzzleFor('2026-07-25', round);
		const second = puzzleFor('2026-07-25', round);
		assert.deepEqual(first, second);
		assert.equal(first.cells.length, 9);
		assert.equal(first.cells[8], null);
		assert.ok(first.options.includes(first.answer));
	}
});

test('different challenge days produce changing signal sets', () => {
	const days = ['2026-07-25', '2026-07-26', '2026-07-27'];
	const serialized = new Set(days.map(day => JSON.stringify(puzzleFor(day, 4).cells)));
	assert.ok(serialized.size > 1);
});
