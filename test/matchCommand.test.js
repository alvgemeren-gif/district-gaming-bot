const assert = require('node:assert/strict');
const test = require('node:test');
const { data } = require('../commands/match/match');

test('match submit requires a screenshot as kill evidence', () => {
	const command = data.toJSON();
	const submit = command.options.find(option => option.name === 'submit');
	const screenshot = submit.options.find(option => option.name === 'screenshot');

	assert.equal(screenshot.required, true);
});
