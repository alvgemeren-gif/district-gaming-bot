const test = require('node:test');
const assert = require('node:assert/strict');
const {
	BUMP_REMINDER_INTERVAL_MS,
	createBumpReminderPayload,
	sendBumpReminder,
} = require('../utils/bumpReminder');

test('bump reminder interval is exactly two hours', () => {
	assert.equal(BUMP_REMINDER_INTERVAL_MS, 7_200_000);
});

test('bump reminder safely mentions only the configured role', () => {
	assert.deepEqual(createBumpReminderPayload('123'), {
		content: "<@&123> 🔔 The server can be bumped again! Use DISBOARD's **/bump** command in this channel.",
		allowedMentions: { roles: ['123'] },
	});
});

test('bump reminder can be sent without a role mention', async () => {
	let sentPayload;
	const channel = {
		isTextBased: () => true,
		send: async payload => {
			sentPayload = payload;
			return { id: 'message-id' };
		},
	};
	const client = {
		channels: {
			fetch: async channelId => {
				assert.equal(channelId, 'channel-id');
				return channel;
			},
		},
	};

	await sendBumpReminder(client, 'channel-id');

	assert.equal(sentPayload.content.includes('/bump'), true);
	assert.deepEqual(sentPayload.allowedMentions, { parse: [] });
});
