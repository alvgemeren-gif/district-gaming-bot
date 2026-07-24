const assert = require('node:assert/strict');
const test = require('node:test');
const { data } = require('../commands/match/match');

test('kills need no screenshot while wins require mobile-compatible proof', () => {
	const command = data.toJSON();
	const kills = command.options.find(option => option.name === 'kills');
	const win = command.options.find(option => option.name === 'win');
	const screenshot = win.options.find(option => option.name === 'screenshot');

	assert.equal(kills.options.some(option => option.name === 'screenshot'), false);
	assert.equal(screenshot.required, true);
});
