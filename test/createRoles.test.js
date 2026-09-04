const test = require('node:test');
const assert = require('node:assert/strict');
const command = require('../commands/create/create');

test('create roles command exposes the roles subcommand', () => {
	const json = command.data.toJSON();
	assert.equal(json.name, 'create');
	assert.equal(json.options[0].name, 'roles');
	assert.equal(json.options[0].type, 1);
	const imageOption = json.options[0].options.find(option => option.name === 'afbeelding');
	assert.ok(imageOption);
	assert.equal(imageOption.type, 11);
});

test('role panel colors accept six-digit hex values', () => {
	assert.equal(command.parseColor('#5865F2'), 0x5865f2);
	assert.equal(command.parseColor('0xffaa00'), 0xffaa00);
	assert.equal(command.parseColor('red'), null);
	assert.equal(command.parseColor('#12345'), null);
});
