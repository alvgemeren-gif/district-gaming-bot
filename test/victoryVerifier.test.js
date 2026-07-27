const assert = require('node:assert/strict');
const test = require('node:test');
const axios = require('axios');
const { verifyScreenshot } = require('../utils/victoryVerifier');

function geminiResponse(payload) {
	return {
		data: {
			candidates: [
				{ content: { parts: [{ text: JSON.stringify(payload) }] } },
			],
		},
	};
}

test('verifyScreenshot returns null confidence when no API key is set', async () => {
	const previousGemini = process.env.GEMINI_API_KEY;
	const previousGroq = process.env.GROQ_API_KEY;
	const previousOpenRouter = process.env.OPENROUTER_API_KEY;
	delete process.env.GEMINI_API_KEY;
	delete process.env.GROQ_API_KEY;
	delete process.env.OPENROUTER_API_KEY;
	try {
		const result = await verifyScreenshot({ imageBuffer: Buffer.from('x'), mime: 'image/png' });
		assert.equal(result.confidence, null);
		assert.equal(result.isVictory, false);
	} finally {
		if (previousGemini !== undefined) {
			process.env.GEMINI_API_KEY = previousGemini;
		}
		if (previousGroq !== undefined) {
			process.env.GROQ_API_KEY = previousGroq;
		}
		if (previousOpenRouter !== undefined) {
			process.env.OPENROUTER_API_KEY = previousOpenRouter;
		}
	}
});

test('verifyScreenshot normalizes and clamps Gemini output', async t => {
	delete process.env.OPENROUTER_API_KEY;
	delete process.env.GROQ_API_KEY;
	process.env.GEMINI_API_KEY = 'test-key';
	t.mock.method(axios, 'post', async () => geminiResponse({
		isVictory: true,
		kills: 250,
		crownVictory: true,
		confidence: 1.7,
		reason: 'Victory banner visible.',
	}));

	const result = await verifyScreenshot({ imageBuffer: Buffer.from('image'), mime: 'image/png' });

	assert.equal(result.isVictory, true);
	assert.equal(result.kills, 100, 'kills clamp to 100');
	assert.equal(result.crownVictory, true);
	assert.equal(result.confidence, 1, 'confidence clamps to 1');
	assert.equal(result.reason, 'Victory banner visible.');
});

test('verifyScreenshot forces crownVictory false when not a victory', async t => {
	delete process.env.OPENROUTER_API_KEY;
	delete process.env.GROQ_API_KEY;
	process.env.GEMINI_API_KEY = 'test-key';
	t.mock.method(axios, 'post', async () => geminiResponse({
		isVictory: false,
		kills: 3,
		crownVictory: true,
		confidence: 0.8,
	}));

	const result = await verifyScreenshot({ imageBuffer: Buffer.from('image'), mime: 'image/png' });

	assert.equal(result.isVictory, false);
	assert.equal(result.crownVictory, false);
	assert.equal(result.kills, 3);
});
