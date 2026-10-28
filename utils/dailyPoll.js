const { dailyQuestions } = require('./dailyPollQuestions');
const { englishQuestions } = require('./dailyPollQuestionsEn');

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;
const POST_HOUR_UTC = 12;
const clientStates = new WeakMap();

function dateKey(date = new Date()) {
	return date.toISOString().slice(0, 10);
}

function questionForDate(date = new Date(), language = 'nl') {
	if (!['nl', 'en'].includes(language)) throw new Error(`Unsupported question language: ${language}`);
	const questions = language === 'en' ? englishQuestions : dailyQuestions;
	const index = Math.floor(date.getTime() / DAY_MS) % questions.length;
	return questions[index];
}

function marker(date, language = 'nl') {
	if (language === 'en') return `Daily question • ${dateKey(date)}`;
	return `Dagvraag • ${dateKey(date)}`;
}

function createQuestionPayload(date = new Date(), language = 'nl') {
	return {
		embeds: [{
			color: 0x9b59b6,
			title: language === 'en' ? '💬 Question of the day' : '💬 Vraag van de dag',
			description: `**${questionForDate(date, language)}**\n\n${language === 'en' ? 'Share your answer in the chat below!' : 'Deel jouw antwoord hieronder in de chat!'}`,
			footer: { text: marker(date, language) },
		}],
		allowedMentions: { parse: [] },
	};
}

async function alreadyPosted(channel, date, botId, language) {
	const dayStart = Math.floor(date.getTime() / DAY_MS) * DAY_MS;
	let before;
	// Doorzoek alle berichten van vandaag, ook in een druk antwoordkanaal.
	while (true) {
		const messages = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
		if (messages.some(message => message.author?.id === botId
			&& message.embeds?.some(embed => embed.footer?.text === marker(date, language)))) return true;
		const oldest = messages.last();
		if (messages.size < 100 || !oldest || oldest.createdTimestamp < dayStart) return false;
		if (oldest.id === before) throw new Error('Could not paginate daily question history.');
		before = oldest.id;
	}
}

async function sendDailyQuestion(client, channelId, date = new Date(), language = 'nl') {
	if (!['nl', 'en'].includes(language)) throw new Error(`Unsupported question language: ${language}`);
	const stateKey = `${channelId}:${language}`;
	let state = clientStates.get(client);
	if (!state) {
		state = { sent: new Map(), pending: new Map() };
		clientStates.set(client, state);
	}
	const key = dateKey(date);
	if (state.pending.has(stateKey)) await state.pending.get(stateKey);
	if (state.sent.get(stateKey) === key) return false;
	// Houd de controle en het versturen samen, ook bij gelijktijdige commands.
	if (state.pending.has(stateKey)) return sendDailyQuestion(client, channelId, date, language);
	const pending = (async () => {
		const channel = await client.channels.fetch(channelId);
		if (!channel?.isTextBased() || !channel.messages || !channel.send) {
			throw new Error(`Question channel ${channelId} is not a writable text channel.`);
		}
		if (await alreadyPosted(channel, date, client.user.id, language)) {
			state.sent.set(stateKey, key);
			return false;
		}
		await channel.send(createQuestionPayload(date, language));
		state.sent.set(stateKey, key);
		return true;
	})();
	state.pending.set(stateKey, pending);
	try {
		return await pending;
	} finally {
		state.pending.delete(stateKey);
	}
}

async function postQuestionIfDue(client, {
	channelId = process.env.QUESTION_CHANNEL_ID_NL || process.env.QUESTION_CHANNEL_ID || process.env.POLL_CHANNEL_ID,
	englishChannelId = process.env.QUESTION_CHANNEL_ID_EN,
	now = new Date(),
} = {}) {
	if (now.getUTCHours() < POST_HOUR_UTC) return false;
	const targets = [[channelId, 'nl'], [englishChannelId, 'en']].filter(([id]) => id);
	const results = await Promise.allSettled(targets.map(([id, language]) =>
		sendDailyQuestion(client, id, now, language)));
	const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
	if (errors.length) throw new AggregateError(errors, 'Could not post all daily questions.');
	return results.some(result => result.value === true);
}

function startDailyQuestionScheduler(client, options = {}) {
	const channelId = options.channelId || process.env.QUESTION_CHANNEL_ID_NL || process.env.QUESTION_CHANNEL_ID || process.env.POLL_CHANNEL_ID;
	const englishChannelId = options.englishChannelId || process.env.QUESTION_CHANNEL_ID_EN;
	if (!channelId && !englishChannelId) {
		console.log('Daily questions disabled: no question channels are configured.');
		return null;
	}
	const run = () => postQuestionIfDue(client, { ...options, channelId, englishChannelId }).catch(error => {
		console.error('Scheduled daily question failed:', error);
	});
	run();
	return setInterval(run, options.intervalMs || CHECK_INTERVAL_MS);
}

module.exports = {
	CHECK_INTERVAL_MS,
	POST_HOUR_UTC,
	createQuestionPayload,
	dateKey,
	postQuestionIfDue,
	questionForDate,
	sendDailyQuestion,
	startDailyQuestionScheduler,
};
