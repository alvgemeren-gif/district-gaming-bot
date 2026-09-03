const test = require('node:test');
const assert = require('node:assert/strict');
const { dailyPollQuestions } = require('../utils/dailyPollQuestions');
const { createPollPayload, postPollIfDue, questionForDate } = require('../utils/dailyPoll');

test('daily poll contains exactly 200 unique questions', () => {
	assert.equal(dailyPollQuestions.length, 200);
	assert.equal(new Set(dailyPollQuestions.map(item => item.question)).size, 200);
});

test('daily question is deterministic and rotates each day', () => {
	assert.deepEqual(questionForDate(new Date('2026-09-03T12:00:00Z')), questionForDate(new Date('2026-09-03T23:00:00Z')));
	assert.notDeepEqual(questionForDate(new Date('2026-09-03T12:00:00Z')), questionForDate(new Date('2026-09-04T12:00:00Z')));
	const payload = createPollPayload(new Date('2026-09-03T12:00:00Z'));
	assert.equal(payload.poll.duration, 24);
	assert.equal(payload.poll.allowMultiselect, false);
	assert.equal(payload.poll.answers.length, 3);
});

test('scheduler posts once and recognizes an existing poll', async () => {
	const sent = [];
	const channel = {
		client: { user: { id: 'bot' } },
		isTextBased: () => true,
		send: async payload => sent.push(payload),
		messages: { fetch: async () => new Map() },
	};
	const client = { channels: { fetch: async () => channel } };
	assert.equal(await postPollIfDue(client, { channelId: 'polls', hourUtc: 12, now: new Date('2026-09-03T12:00:00Z') }), true);
	assert.equal(sent.length, 1);

	channel.messages.fetch = async () => new Map([['1', { author: { id: 'bot' }, content: sent[0].content }]]);
	assert.equal(await postPollIfDue(client, { channelId: 'polls', hourUtc: 12, now: new Date('2026-09-03T13:00:00Z') }), false);
	assert.equal(sent.length, 1);
});
