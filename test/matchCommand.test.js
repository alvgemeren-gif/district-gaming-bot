const assert = require('node:assert/strict');
const test = require('node:test');
const { data } = require('../commands/match/match');

test('match submit accepts mobile win claims without a screenshot', () => {
	const command = data.toJSON();
	const submit = command.options.find(option => option.name === 'submit');
	const win = submit.options.find(option => option.name === 'win');
	const screenshot = submit.options.find(option => option.name === 'screenshot');

	assert.equal(win.required, true);
	assert.notEqual(screenshot.required, true);
});
