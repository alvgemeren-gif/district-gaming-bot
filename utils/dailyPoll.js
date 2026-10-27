const { dailyQuestions } = require('./dailyPollQuestions');

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;
const POST_HOUR_UTC = 12;
const clientStates = new WeakMap();

function dateKey(date = new Date()) {
	return date.toISOString().slice(0, 10);
}

function questionForDate(date = new Date()) {
	const index = Math.floor(date.getTime() / DAY_MS) % dailyQuestions.length;
	return dailyQuestions[index];
}

function marker(date) {
	return `Dagvraag • ${dateKey(date)}`;
}

function createQuestionPayload(date = new Date()) {
	return {
		embeds: [{
			color: 0x9b59b6,
			title: '💬 Vraag van de dag',
			description: `**${questionForDate(date)}**\n\nDeel jouw antwoord hieronder in de chat!`,
			footer: { text: marker(date) },
		}],
		allowedMentions: { parse: [] },
	};
}

async function alreadyPosted(channel, date, botId) {
	const dayStart = Math.floor(date.getTime() / DAY_MS) * DAY_MS;
	let before;
	// Doorzoek alle berichten van vandaag, ook in een druk antwoordkanaal.
	while (true) {
		const messages = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
		if (messages.some(message => message.author?.id === botId
			&& message.embeds?.some(embed => embed.footer?.text === marker(date)))) return true;
		const oldest = messages.last();
		if (messages.size < 100 || !oldest || oldest.createdTimestamp < dayStart) return false;
		if (oldest.id === before) throw new Error('Could not paginate daily question history.');
		before = oldest.id;
	}
}

async function sendDailyQuestion(client, channelId, date = new Date()) {
	let state = clientStates.get(client);
	if (!state) {
		state = { sent: new Map(), pending: new Map() };
		clientStates.set(client, state);
	}
	const key = dateKey(date);
	if (state.pending.has(channelId)) await state.pending.get(channelId);
	if (state.sent.get(channelId) === key) return false;
	// Houd de controle en het versturen samen, ook bij gelijktijdige commands.
	if (state.pending.has(channelId)) return sendDailyQuestion(client, channelId, date);
	const pending = (async () => {
		const channel = await client.channels.fetch(channelId);
		if (!channel?.isTextBased() || !channel.messages || !channel.send) {
			throw new Error(`Question channel ${channelId} is not a writable text channel.`);
		}
		if (await alreadyPosted(channel, date, client.user.id)) {
			state.sent.set(channelId, key);
			return false;
		}
		await channel.send(createQuestionPayload(date));
		state.sent.set(channelId, key);
		return true;
	})();
	state.pending.set(channelId, pending);
	try {
		return await pending;
	} finally {
		state.pending.delete(channelId);
	}
}

async function postQuestionIfDue(client, {
	channelId = process.env.QUESTION_CHANNEL_ID || process.env.POLL_CHANNEL_ID,
	now = new Date(),
} = {}) {
	if (!channelId || now.getUTCHours() < POST_HOUR_UTC) return false;
	return sendDailyQuestion(client, channelId, now);
}

function startDailyQuestionScheduler(client, options = {}) {
	const channelId = options.channelId || process.env.QUESTION_CHANNEL_ID || process.env.POLL_CHANNEL_ID;
	if (!channelId) {
		console.log('Daily questions disabled: QUESTION_CHANNEL_ID is not configured.');
		return null;
	}
	const run = () => postQuestionIfDue(client, { ...options, channelId }).catch(error => {
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
