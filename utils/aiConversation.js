const OPENAI_URL = 'https://api.openai.com/v1/responses';
const MAX_HISTORY_MESSAGES = 16;
const MAX_REPLY_LENGTH = 1800;

function createAiError(message, code, details = {}) {
	const error = new Error(message);
	error.code = code;
	Object.assign(error, details);
	return error;
}

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
		throw createAiError(
			'OPENAI_API_KEY is not configured.',
			'OPENAI_API_KEY_MISSING'
		);
	}

	let response;
	try {
		response = await (options.fetch || fetch)(OPENAI_URL, {
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
				reasoning: { effort: 'none' },
				text: { verbosity: 'low' },
				max_output_tokens: 500,
				store: false,
			}),
			signal: AbortSignal.timeout(options.timeout || 30000),
		});
	} catch (error) {
		if (error.name === 'AbortError' || error.name === 'TimeoutError') {
			throw createAiError('OpenAI request timed out.', 'OPENAI_TIMEOUT');
		}
		throw createAiError(error.message, 'OPENAI_NETWORK_ERROR', { cause: error });
	}

	const body = await response.json().catch(() => ({}));

	if (!response.ok) {
		const providerCode = body?.error?.code;
		let code = 'OPENAI_REQUEST_FAILED';
		if (response.status === 401) code = 'OPENAI_AUTH_FAILED';
		else if (providerCode === 'insufficient_quota') code = 'OPENAI_QUOTA_EXCEEDED';
		else if (response.status === 429) code = 'OPENAI_RATE_LIMITED';

		throw createAiError(
			body?.error?.message || `OpenAI request failed (${response.status}).`,
			code,
			{ status: response.status, providerCode }
		);
	}

	const text = extractResponseText(body);
	if (!text) {
		throw createAiError(
			`OpenAI returned no text (status: ${body?.status || 'unknown'}).`,
			'OPENAI_EMPTY_RESPONSE'
		);
	}
	return discordSafeText(text);
}

module.exports = {
	MAX_HISTORY_MESSAGES,
	discordSafeText,
	extractResponseText,
	requestAiReply,
	trimHistory,
};
