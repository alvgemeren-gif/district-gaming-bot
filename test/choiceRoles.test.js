const assert = require('node:assert/strict');
const test = require('node:test');
const command = require('../commands/rollen/rollen');

test('keuzerollenmenu laat precies één vaste rol kiezen', () => {
	const menu = command.buildMemberMenu([
		{ id: '111', name: 'Noord' },
		{ id: '222', name: 'Zuid' },
	]).toJSON();

	assert.equal(menu.custom_id, 'choice-roles:choose');
	assert.equal(menu.min_values, 1);
	assert.equal(menu.max_values, 1);
	assert.deepEqual(menu.options.map(option => option.value), ['111', '222']);
});

test('choice-roles blijft alleen beschikbaar na expliciete toestemming', () => {
	const data = command.data.toJSON();

	assert.equal(data.name, 'choice-roles');
	assert.equal(data.default_member_permissions, '0');
	assert.equal(data.options[0].name, 'text');
	assert.equal(data.options[1].name, 'reset-lid');
});
