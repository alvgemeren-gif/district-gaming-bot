const test = require('node:test');
const assert = require('node:assert/strict');
const {
	discordSafeText,
	extractResponseText,
	trimHistory,
} = require('../utils/aiConversation');
const command = require('../commands/talk/talk');

test('talk command has an optional opening message', () => {
	const json = command.data.toJSON();
	assert.equal(json.name, 'talk');
	assert.equal(json.options[0].name, 'bericht');
	assert.equal(json.options[0].required, false);
});

test('extractResponseText supports the Responses API output format', () => {
	assert.equal(extractResponseText({
		output: [{ content: [{ type: 'output_text', text: 'Hallo!' }] }],
	}), 'Hallo!');
});

test('conversation history and Discord output are bounded', () => {
	const messages = Array.from({ length: 20 }, (_, index) => ({ role: 'user', content: String(index) }));
	assert.deepEqual(trimHistory(messages, 3).map(message => message.content), ['17', '18', '19']);
	assert.equal(discordSafeText('abcdef', 5), 'abcd…');
});
