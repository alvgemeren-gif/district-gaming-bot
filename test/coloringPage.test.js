const assert = require('node:assert/strict');
const test = require('node:test');
const axios = require('axios');
const { generateColoringPage, validateAttachment } = require('../utils/coloringPage');
const command = require('../commands/kleurplaat/kleurplaat');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=', 'base64');
const attachment = { contentType: 'image/png', size: 100, url: 'https://cdn.discordapp.com/attachments/123/456/cat.png?ex=abc' };

function setup(t) {
	const previous = process.env.OPENAI_API_KEY;
	process.env.OPENAI_API_KEY = 'test-key';
	t.after(() => {
		if (previous === undefined) delete process.env.OPENAI_API_KEY;
		else process.env.OPENAI_API_KEY = previous;
	});
}

function interaction(id = '123', image = attachment) {
	const messages = [];
	return {
		id, user: { id }, messages, deferred: false,
		options: { getAttachment: () => image, getString: name => name === 'eisen' ? 'Een kat in een bloementuin' : null },
		async reply(message) { messages.push(message); },
		async deferReply() { this.deferred = true; },
		async editReply(message) { messages.push(message); },
	};
}

test('command requires requirements and accepts an optional reference', () => {
	const data = command.data.toJSON();
	assert.equal(data.name, 'kleurplaat');
	assert.equal(data.options[0].required, true);
	assert.equal(data.options[1].name, 'afbeelding');
	assert.notEqual(data.options[1].required, true);
});

test('reference validation rejects unsafe URLs, unsupported types and oversized input', () => {
	assert.doesNotThrow(() => validateAttachment(attachment));
	for (const change of [
		{ url: 'http://cdn.discordapp.com/attachments/1/2/x.png' },
		{ url: 'https://cdn.discordapp.com.evil.example/attachments/1/2/x.png' },
		{ url: 'https://localhost/attachments/1/2/x.png' },
		{ contentType: 'image/svg+xml' }, { size: 11 * 1024 * 1024 },
	]) assert.throws(() => validateAttachment({ ...attachment, ...change }));
});

test('uses image edits with reference and returns downloadable bytes', async t => {
	setup(t);
	t.mock.method(axios, 'post', async (url, body, options) => {
		assert.equal(url, 'https://api.openai.com/v1/images/edits');
		assert.deepEqual(body.images, [{ image_url: attachment.url }]);
		assert.match(body.prompt, /Een kat in een bloementuin/);
		assert.match(body.prompt, /pure white background/);
		assert.equal(body.size, '1024x1536');
		assert.equal(body.quality, 'high');
		assert.equal(options.headers.Authorization, 'Bearer test-key');
		return { data: { data: [{ b64_json: png.toString('base64') }] } };
	});
	const request = interaction();
	await command.execute(request);
	assert.equal(request.deferred, true);
	assert.equal(request.messages.at(-1).files[0].name, 'kleurplaat-123.png');
	assert.deepEqual(request.messages.at(-1).files[0].attachment, png);
});

test('text-only requests use generations and chosen orientation', async t => {
	setup(t);
	t.mock.method(axios, 'post', async (url, body) => {
		assert.equal(url, 'https://api.openai.com/v1/images/generations');
		assert.equal(body.images, undefined);
		assert.equal(body.size, '1536x1024');
		return { data: { data: [{ b64_json: png.toString('base64') }] } };
	});
	assert.deepEqual(await generateColoringPage({ requirements: 'Een tuin', orientation: 'liggend' }), png);
});

test('rejects missing, invalid and oversized API output', async t => {
	setup(t);
	let encoded;
	t.mock.method(axios, 'post', async () => ({ data: { data: [{ b64_json: encoded }] } }));
	await assert.rejects(generateColoringPage({ requirements: 'Een kat' }), /geen afbeelding/);
	encoded = Buffer.from('not png').toString('base64');
	await assert.rejects(generateColoringPage({ requirements: 'Een kat' }), /geen geldig PNG/);
	encoded = png.toString('base64');
	await assert.rejects(generateColoringPage({ requirements: 'Een kat', maxOutputBytes: 8 }), /te groot/);
});

test('missing configuration and invalid attachments do not call the API', async t => {
	setup(t);
	const post = t.mock.method(axios, 'post', async () => { throw new Error('Must not be called'); });
	delete process.env.OPENAI_API_KEY;
	const missing = interaction();
	await command.execute(missing);
	assert.match(missing.messages[0].content, /OPENAI_API_KEY/);
	process.env.OPENAI_API_KEY = 'test-key';
	const invalid = interaction('456', { ...attachment, contentType: 'text/plain' });
	await command.execute(invalid);
	assert.match(invalid.messages[0].content, /PNG/);
	assert.equal(post.mock.callCount(), 0);
});

test('duplicate requests are blocked and failures release the user slot', async t => {
	setup(t);
	t.mock.method(console, 'error', () => {});
	let release;
	t.mock.method(axios, 'post', () => new Promise((resolve, reject) => { release = reject; }));
	const first = interaction('concurrent');
	const pending = command.execute(first);
	await new Promise(resolve => setImmediate(resolve));
	const duplicate = interaction('concurrent');
	await command.execute(duplicate);
	assert.match(duplicate.messages[0].content, /al gemaakt/);
	release({ isAxiosError: true, response: { status: 429 } });
	await pending;
	assert.match(first.messages.at(-1).content, /API-tegoed/);
	t.mock.method(axios, 'post', async () => ({ data: { data: [{ b64_json: png.toString('base64') }] } }));
	const retry = interaction('concurrent');
	await command.execute(retry);
	assert.ok(retry.messages.at(-1).files);
});
