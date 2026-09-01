const assert = require('node:assert/strict');
const test = require('node:test');
const command = require('../commands/autorole/autorole');

test('autorole biedt instellen, status en uitschakelen aan beheerders', () => {
	const data = command.data.toJSON();

	assert.equal(data.name, 'autorole');
	assert.equal(data.default_member_permissions, '8');
	assert.deepEqual(data.options.map(option => option.name), [
		'instellen',
		'status',
		'uitschakelen',
	]);
});
