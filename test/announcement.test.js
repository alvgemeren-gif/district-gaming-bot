const assert = require('node:assert/strict');
const test = require('node:test');
const command = require('../commands/announcement/announcement');

test('announcement command is administrator-only and requires a channel and role', () => {
	const json = command.data.toJSON();
	assert.equal(json.name, 'announcement');
	assert.equal(json.default_member_permissions, '8');
	assert.equal(json.options[0].name, 'create');
	assert.deepEqual(json.options[0].options.map(option => option.name), ['channel', 'role']);
	assert.ok(json.options[0].options.every(option => option.required));
});

test('announcement colors accept six-digit hex values', () => {
	assert.equal(command.parseColor('#F1C40F'), 0xf1c40f);
	assert.equal(command.parseColor('0x5865F2'), 0x5865f2);
	assert.equal(command.parseColor('yellow'), null);
});
