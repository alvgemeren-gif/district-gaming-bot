const test = require('node:test');
const assert = require('node:assert/strict');
const {
	discordSafeText,
	extractResponseText,
	requestAiReply,
	trimHistory,
} = require('../utils/aiConversation');
const command = require('../commands/talk/talk');

test('talk command has an optional opening message', () => {
	const json = command.data.toJSON();
	assert.equal(json.name, 'talk');
	assert.equal(json.options[0].name, 'message');
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

test('AI request disables reasoning so the token budget produces visible text', async () => {
	let requestBody;
	const reply = await requestAiReply(
		[{ role: 'user', content: 'Hello' }],
		{
			apiKey: 'test-key',
			fetch: async (_url, request) => {
				requestBody = JSON.parse(request.body);
				return {
					ok: true,
					json: async () => ({ output_text: 'Hi!' }),
				};
			},
		}
	);

	assert.equal(reply, 'Hi!');
	assert.deepEqual(requestBody.reasoning, { effort: 'none' });
	assert.deepEqual(requestBody.text, { verbosity: 'low' });
});

test('AI request classifies quota errors', async () => {
	await assert.rejects(
		requestAiReply([{ role: 'user', content: 'Hello' }], {
			apiKey: 'test-key',
			fetch: async () => ({
				ok: false,
				status: 429,
				json: async () => ({
					error: { code: 'insufficient_quota', message: 'Quota exceeded' },
				}),
			}),
		}),
		error => error.code === 'OPENAI_QUOTA_EXCEEDED' && error.status === 429
	);
});
