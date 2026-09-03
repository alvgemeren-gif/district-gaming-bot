const test = require('node:test');
const assert = require('node:assert/strict');
const { clearGames, guess, randomNumber, startGame } = require('../utils/guessNumberGame');
const { data } = require('../commands/guess-number/guess-number');

test.beforeEach(clearGames);

test('guess-number command exposes start, guess and stop', () => {
	assert.deepEqual(data.toJSON().options.map(option => option.name), ['start', 'guess', 'stop']);
});

test('random number includes both limits', () => {
	assert.equal(randomNumber(100, () => 0), 1);
	assert.equal(randomNumber(100, () => 0.999999), 100);
});

test('game gives higher and lower hints and ends on the answer', () => {
	const context = { guildId: 'guild', channelId: 'channel' };
	const started = startGame({ ...context, hostId: 'host', max: 100, random: () => 0.49 });
	assert.equal(started.status, 'started');
	assert.equal(guess({ ...context, number: 20, playerId: 'one' }).status, 'higher');
	assert.equal(guess({ ...context, number: 80, playerId: 'two' }).status, 'lower');
	assert.equal(guess({ ...context, number: 50, playerId: 'one' }).status, 'correct');
	assert.equal(guess({ ...context, number: 50, playerId: 'two' }).status, 'no_game');
});

test('game has unlimited guesses but players must alternate', () => {
	const context = { guildId: 'guild', channelId: 'channel' };
	startGame({ ...context, hostId: 'host', random: () => 0.99 });
	for (let attempt = 0; attempt < 100; attempt += 1) {
		const playerId = attempt % 2 ? 'two' : 'one';
		assert.equal(guess({ ...context, number: 1, playerId }).status, 'higher');
	}
	assert.equal(guess({ ...context, number: 1, playerId: 'two' }).status, 'not_your_turn');
	assert.equal(guess({ ...context, number: 100, playerId: 'one' }).status, 'correct');
});

test('an active game does not expire over time', () => {
	const context = { guildId: 'guild', channelId: 'channel' };
	startGame({ ...context, hostId: 'host', random: () => 0.49 });
	assert.equal(guess({ ...context, number: 20, playerId: 'one', now: Date.now() + (365 * 24 * 60 * 60 * 1000) }).status, 'higher');
});
