const assert = require('node:assert/strict');
const test = require('node:test');
const { data } = require('../commands/match/match');

test('match submit combines kills and wins in one command', () => {
	const command = data.toJSON();
	const submit = command.options.find(option => option.name === 'submit');
	const type = submit.options.find(option => option.name === 'type');
	const screenshot = submit.options.find(option => option.name === 'screenshot');

	assert.deepEqual(type.choices.map(choice => choice.value), ['kills', 'win']);
	assert.notEqual(screenshot.required, true);
});
