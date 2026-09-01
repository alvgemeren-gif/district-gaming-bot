const assert = require('node:assert/strict');
const test = require('node:test');
const { parseColor, data } = require('../commands/embed/embed');

test('embed colors accept common hex formats', () => {
	assert.equal(parseColor('#5865F2'), 0x5865f2);
	assert.equal(parseColor('0x57F287'), 0x57f287);
	assert.equal(parseColor('not-a-color'), null);
});

test('embed command supports creation, direct edits and form edits', () => {
	const command = data.toJSON();

	assert.equal(command.name, 'embed');
	assert.equal(command.default_member_permissions, '8');
	assert.deepEqual(command.options.map(option => option.name), ['create', 'edit', 'editor']);

	const editor = command.options.find(option => option.name === 'editor');
	assert.deepEqual(editor.options.map(option => option.name), ['channel', 'message-id']);
});
