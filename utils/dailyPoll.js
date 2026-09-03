const { dailyPollQuestions } = require('./dailyPollQuestions');

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;

function dateKey(date = new Date()) {
	return date.toISOString().slice(0, 10);
}

function questionIndexForDate(date = new Date()) {
	return Math.floor(date.getTime() / DAY_MS) % dailyPollQuestions.length;
}

function questionForDate(date = new Date()) {
	return dailyPollQuestions[questionIndexForDate(date)];
}

function createPollPayload(date = new Date(), { test = false } = {}) {
	const item = questionForDate(date);
	return {
		content: test ? '🧪 **Test van de dagelijkse poll**' : `📊 **Dagelijkse poll • ${dateKey(date)}**`,
		poll: {
			question: { text: item.question },
			answers: item.answers.map(text => ({ text })),
			duration: 24,
			allowMultiselect: false,
		},
		allowedMentions: { parse: [] },
	};
}

async function sendDailyPoll(client, channelId, date = new Date(), options = {}) {
	const channel = await client.channels.fetch(channelId).catch(() => null);
	if (!channel?.isTextBased()) throw new Error(`Poll channel ${channelId} was not found or is not text-based.`);
	return channel.send(createPollPayload(date, options));
}

async function alreadyPosted(channel, key) {
	if (!channel.messages?.fetch) return false;
	const messages = await channel.messages.fetch({ limit: 100 });
	return [...messages.values()].some(message => message.author?.id === channel.client?.user?.id
		&& message.content === `📊 **Dagelijkse poll • ${key}**`);
}

async function postPollIfDue(client, {
	channelId = process.env.POLL_CHANNEL_ID,
	hourUtc = Number(process.env.POLL_HOUR_UTC ?? 12),
	now = new Date(),
} = {}) {
	if (!channelId || now.getUTCHours() < hourUtc) return false;
	const channel = await client.channels.fetch(channelId).catch(() => null);
	if (!channel?.isTextBased()) throw new Error(`Poll channel ${channelId} was not found or is not text-based.`);
	const key = dateKey(now);
	if (await alreadyPosted(channel, key)) return false;
	await channel.send(createPollPayload(now));
	return true;
}

function startDailyPollScheduler(client, options = {}) {
	const channelId = options.channelId || process.env.POLL_CHANNEL_ID;
	if (!channelId) {
		console.log('Daily polls disabled: POLL_CHANNEL_ID is not configured.');
		return null;
	}
	const run = () => postPollIfDue(client, { ...options, channelId }).catch(error => {
		console.error('Scheduled daily poll failed:', error);
	});
	run();
	return setInterval(run, options.intervalMs || CHECK_INTERVAL_MS);
}

module.exports = {
	CHECK_INTERVAL_MS,
	createPollPayload,
	dateKey,
	postPollIfDue,
	questionForDate,
	questionIndexForDate,
	sendDailyPoll,
	startDailyPollScheduler,
};
