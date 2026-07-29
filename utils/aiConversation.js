const OPENAI_URL = 'https://api.openai.com/v1/responses';
const MAX_HISTORY_MESSAGES = 16;
const MAX_REPLY_LENGTH = 1800;

function extractResponseText(response) {
	if (typeof response?.output_text === 'string' && response.output_text.trim()) {
		return response.output_text.trim();
	}

	const text = response?.output
		?.flatMap(item => item?.content || [])
		.filter(item => item?.type === 'output_text' && typeof item.text === 'string')
		.map(item => item.text)
		.join('\n')
		.trim();

	return text || null;
}

function trimHistory(messages, maximum = MAX_HISTORY_MESSAGES) {
	return messages.slice(-maximum);
}

function discordSafeText(text, maximum = MAX_REPLY_LENGTH) {
	if (text.length <= maximum) return text;
	return `${text.slice(0, maximum - 1).trimEnd()}…`;
}

async function requestAiReply(messages, options = {}) {
	const apiKey = options.apiKey || process.env.OPENAI_API_KEY;

	if (!apiKey) {
		const error = new Error('OPENAI_API_KEY is not configured.');
		error.code = 'OPENAI_API_KEY_MISSING';
		throw error;
	}

	const response = await (options.fetch || fetch)(OPENAI_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: options.model || process.env.OPENAI_MODEL || 'gpt-5.6-sol',
			instructions:
				process.env.TALK_AI_INSTRUCTIONS ||
				'You are a friendly, helpful conversation partner in a Discord server. ' +
				'Reply in the same language as the user, keep responses concise, and do not use @mentions.',
			input: trimHistory(messages),
			max_output_tokens: 500,
			store: false,
		}),
		signal: AbortSignal.timeout(options.timeout || 30000),
	});

	const body = await response.json().catch(() => ({}));

	if (!response.ok) {
		const error = new Error(body?.error?.message || `OpenAI request failed (${response.status}).`);
		error.status = response.status;
		throw error;
	}

	const text = extractResponseText(body);
	if (!text) throw new Error('OpenAI returned an empty response.');
	return discordSafeText(text);
}

module.exports = {
	MAX_HISTORY_MESSAGES,
	discordSafeText,
	extractResponseText,
	requestAiReply,
	trimHistory,
};
