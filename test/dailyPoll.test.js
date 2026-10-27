const test = require('node:test');
const assert = require('node:assert/strict');
const { Collection } = require('discord.js');
const { dailyQuestions } = require('../utils/dailyPollQuestions');
const { createQuestionPayload, postQuestionIfDue, questionForDate, sendDailyQuestion } = require('../utils/dailyPoll');
const command = require('../commands/poll/poll');

function fixture() {
	const sent = [];
	const history = new Collection();
	const channel = {
		id: 'questions',
		isTextBased: () => true,
		send: async payload => {
			sent.push(payload);
			history.set(String(sent.length), { author: { id: 'bot' }, embeds: payload.embeds });
		},
		messages: { fetch: async () => history },
		toString: () => '<#questions>',
	};
	return { sent, history, channel, client: { user: { id: 'bot' }, channels: { fetch: async () => channel } } };
}

test('365 unique open questions rotate across a full year, including leap day', () => {
	assert.equal(dailyQuestions.length, 365);
	assert.equal(new Set(dailyQuestions).size, 365);
	assert.ok(dailyQuestions.every(question => question.endsWith('?')));
	const start = Date.parse('2028-01-01T12:00:00Z');
	const cycle = Array.from({ length: 365 }, (_, i) => questionForDate(new Date(start + i * 86400000)));
	assert.equal(new Set(cycle).size, 365);
	assert.equal(questionForDate(new Date(start + 365 * 86400000)), cycle[0]);
});

test('question is consistent within a UTC date and is an embed without choices', () => {
	assert.equal(questionForDate(new Date('2026-09-03T00:00:00Z')), questionForDate(new Date('2026-09-03T23:59:59Z')));
	const payload = createQuestionPayload(new Date('2026-09-03T12:00:00Z'));
	assert.equal(payload.poll, undefined);
	assert.equal(payload.components, undefined);
	assert.equal(payload.embeds.length, 1);
	assert.match(payload.embeds[0].description, /Deel jouw antwoord hieronder/);
	assert.equal(payload.embeds[0].footer.text, 'Dagvraag • 2026-09-03');
});

test('scheduler posts at 12 UTC in winter and summer, never before', async () => {
	for (const day of ['2026-01-03', '2026-07-03']) {
		const { client, sent } = fixture();
		assert.equal(await postQuestionIfDue(client, { channelId: 'questions', now: new Date(`${day}T11:59:59Z`) }), false);
		assert.equal(await postQuestionIfDue(client, { channelId: 'questions', now: new Date(`${day}T12:00:00Z`) }), true);
		assert.equal(await postQuestionIfDue(client, { channelId: 'questions', now: new Date(`${day}T18:00:00Z`) }), false);
		assert.equal(sent.length, 1);
	}
});

test('restart recognizes a manual question and tomorrow gets a new question', async () => {
	const { client, sent } = fixture();
	const morning = new Date('2026-09-03T08:00:00Z');
	assert.equal(await sendDailyQuestion(client, 'questions', morning), true);
	const restartedClient = { ...client };
	assert.equal(await postQuestionIfDue(restartedClient, { channelId: 'questions', now: new Date('2026-09-03T12:00:00Z') }), false);
	assert.equal(await postQuestionIfDue(restartedClient, { channelId: 'questions', now: new Date('2026-09-04T12:00:00Z') }), true);
	assert.equal(sent.length, 2);
});

test('history lookup finds a question behind more than 100 replies', async () => {
	const { client, channel, sent } = fixture();
	const date = new Date('2026-09-03T13:00:00Z');
	const recent = new Collection(Array.from({ length: 100 }, (_, i) => [String(i), {
		id: String(i), author: { id: 'member' }, embeds: [], createdTimestamp: date.getTime(),
	}]));
	const calls = [];
	channel.messages.fetch = async options => {
		calls.push(options);
		return options.before ? new Collection([['older', {
			author: { id: 'bot' }, embeds: createQuestionPayload(date).embeds,
		}]]) : recent;
	};
	assert.equal(await sendDailyQuestion(client, 'questions', date), false);
	assert.equal(sent.length, 0);
	assert.deepEqual(calls, [{ limit: 100 }, { limit: 100, before: '99' }]);
});

test('a member copying the footer cannot suppress the daily question', async () => {
	const { client, history } = fixture();
	const date = new Date('2026-09-03T13:00:00Z');
	history.set('fake', { author: { id: 'member' }, embeds: createQuestionPayload(date).embeds });
	assert.equal(await sendDailyQuestion(client, 'questions', date), true);
});

test('concurrent manual and automatic sends produce only one message', async () => {
	const { client, sent } = fixture();
	const date = new Date('2026-09-03T12:00:00Z');
	const results = await Promise.all(Array.from({ length: 4 }, () => sendDailyQuestion(client, 'questions', date)));
	assert.equal(results.filter(Boolean).length, 1);
	assert.equal(sent.length, 1);
});

test('a failed send can be retried', async () => {
	const { client, channel } = fixture();
	const send = channel.send;
	channel.send = async () => { throw new Error('Missing permissions'); };
	await assert.rejects(sendDailyQuestion(client, 'questions'), /Missing permissions/);
	channel.send = send;
	assert.equal(await sendDailyQuestion(client, 'questions'), true);
});

test('vraag is an admin-only guild command with an optional channel', () => {
	const data = command.data.toJSON();
	assert.equal(data.name, 'vraag');
	assert.equal(data.default_member_permissions, '8');
	assert.equal(data.dm_permission, false);
	assert.equal(data.options[0].name, 'kanaal');
	assert.ok(!data.options[0].required);
});

test('vraag sends a question and reports an already posted question', async () => {
	const { client, channel, sent } = fixture();
	const replies = [];
	const interaction = {
		client, channel, inGuild: () => true,
		memberPermissions: { has: () => true },
		options: { getChannel: () => null },
		deferReply: async () => {},
		editReply: async text => replies.push(text),
	};
	await command.execute(interaction);
	await command.execute(interaction);
	assert.equal(sent.length, 1);
	assert.match(replies[0], /is geplaatst/);
	assert.match(replies[1], /staat al/);
});

test('vraag rejects non-admin users', async () => {
	let response;
	await command.execute({
		inGuild: () => true,
		memberPermissions: { has: () => false },
		reply: async payload => { response = payload; },
	});
	assert.match(response.content, /Alleen een serverbeheerder/);
	assert.equal(response.ephemeral, true);
});
