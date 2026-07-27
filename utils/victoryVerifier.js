const axios = require('axios');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const GROQ_MODEL = process.env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS = (process.env.OPENROUTER_MODEL
	? [process.env.OPENROUTER_MODEL]
	: [
		'google/gemma-4-26b-a4b-it:free',
		'google/gemma-4-31b-it:free',
		'nvidia/nemotron-nano-12b-v2-vl:free',
	]);

const PROMPT = [
	'You are verifying a Fortnite end-of-match screenshot for a Discord competition.',
	'Look at the image and answer strictly about what is visible.',
	'Return a JSON object with exactly these fields:',
	'- isVictory: true only if the "#1 Victory Royale" banner (a win) is clearly shown.',
	'- kills: the number of eliminations shown for this player (0 if not visible).',
	'- crownVictory: true only if a Crown Victory Royale (crowned win) is clearly shown.',
	'- confidence: your certainty from 0 to 1 that the above values are correct.',
	'- reason: one short sentence describing what you saw.',
	'Be conservative: if the image is unclear, edited, cropped, or not a Fortnite result screen, lower the confidence.',
].join('\n');

const RESPONSE_SCHEMA = {
	type: 'object',
	properties: {
		isVictory: { type: 'boolean' },
		kills: { type: 'integer' },
		crownVictory: { type: 'boolean' },
		confidence: { type: 'number' },
		reason: { type: 'string' },
	},
	required: ['isVictory', 'kills', 'crownVictory', 'confidence'],
};

function clampConfidence(value) {
	const number = Number(value);
	if (!Number.isFinite(number)) {
		return null;
	}
	return Math.min(Math.max(number, 0), 1);
}

function clampKills(value) {
	const number = Number(value);
	if (!Number.isInteger(number) || number < 0) {
		return 0;
	}
	return Math.min(number, 100);
}

function normalize(parsed) {
	return {
		isVictory: Boolean(parsed.isVictory),
		kills: clampKills(parsed.kills),
		crownVictory: Boolean(parsed.crownVictory) && Boolean(parsed.isVictory),
		confidence: clampConfidence(parsed.confidence),
		reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 500) : null,
	};
}

function unavailable(reason) {
	return { isVictory: false, kills: 0, crownVictory: false, confidence: null, reason };
}

async function callOpenAICompatible(endpoint, apiKey, model, imageBuffer, mime, extraHeaders = {}) {
	const dataUrl = `data:${mime || 'image/jpeg'};base64,${imageBuffer.toString('base64')}`;
	const response = await axios.post(
		endpoint,
		{
			model,
			temperature: 0,
			response_format: { type: 'json_object' },
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: PROMPT },
						{ type: 'image_url', image_url: { url: dataUrl } },
					],
				},
			],
		},
		{
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				...extraHeaders,
			},
			timeout: 20000,
		}
	);

	const text = response.data?.choices?.[0]?.message?.content;
	if (!text) {
		throw new Error('The verifier returned an empty response.');
	}
	return normalize(JSON.parse(text));
}

async function callOpenRouter(apiKey, imageBuffer, mime) {
	const headers = {
		'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://cozy-hotel.bot',
		'X-Title': 'Cozy Hotel Victory Verifier',
	};
	let lastError;

	for (const model of OPENROUTER_MODELS) {
		try {
			return await callOpenAICompatible(OPENROUTER_ENDPOINT, apiKey, model, imageBuffer, mime, headers);
		} catch (error) {
			const status = error.response?.status;
			lastError = error;
			// 429/5xx are transient free-tier provider errors; try the next model.
			if (status === 429 || (status >= 500 && status < 600)) {
				continue;
			}
			throw error;
		}
	}

	throw lastError || new Error('All OpenRouter models were unavailable.');
}

async function callGroq(apiKey, imageBuffer, mime) {
	const dataUrl = `data:${mime || 'image/jpeg'};base64,${imageBuffer.toString('base64')}`;
	const response = await axios.post(
		GROQ_ENDPOINT,
		{
			model: GROQ_MODEL,
			temperature: 0,
			response_format: { type: 'json_object' },
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: PROMPT },
						{ type: 'image_url', image_url: { url: dataUrl } },
					],
				},
			],
		},
		{
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			timeout: 20000,
		}
	);

	const text = response.data?.choices?.[0]?.message?.content;
	if (!text) {
		throw new Error('Groq returned an empty response.');
	}
	return normalize(JSON.parse(text));
}

async function callGemini(apiKey, imageBuffer, mime) {
	const response = await axios.post(
		GEMINI_ENDPOINT,
		{
			contents: [
				{
					parts: [
						{ text: PROMPT },
						{ inlineData: { mimeType: mime || 'image/jpeg', data: imageBuffer.toString('base64') } },
					],
				},
			],
			generationConfig: {
				responseMimeType: 'application/json',
				responseSchema: RESPONSE_SCHEMA,
				temperature: 0,
			},
		},
		{
			params: { key: apiKey },
			headers: { 'Content-Type': 'application/json' },
			timeout: 20000,
		}
	);

	const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
	if (!text) {
		throw new Error('Gemini returned an empty response.');
	}
	return normalize(JSON.parse(text));
}

async function verifyScreenshot({ imageBuffer, mime }) {
	if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
		return unavailable('No image data was provided.');
	}

	const openRouterKey = process.env.OPENROUTER_API_KEY;
	if (openRouterKey) {
		return callOpenRouter(openRouterKey, imageBuffer, mime);
	}

	const groqKey = process.env.GROQ_API_KEY;
	if (groqKey) {
		return callGroq(groqKey, imageBuffer, mime);
	}

	const geminiKey = process.env.GEMINI_API_KEY;
	if (geminiKey) {
		return callGemini(geminiKey, imageBuffer, mime);
	}

	return unavailable('No OPENROUTER_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY is configured.');
}

module.exports = { verifyScreenshot };
