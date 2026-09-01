const assert = require('node:assert/strict');
const test = require('node:test');
const command = require('../commands/meme/meme');

test('meme is een publiek commando', () => {
	const data = command.data.toJSON();
	assert.equal(data.name, 'meme');
	assert.equal(data.default_member_permissions, undefined);
});

test('meme filter weigert NSFW, spoilers en onveilige URLs', () => {
	const valid = { title: 'Leuke meme', url: 'https://example.com/meme.png' };
	assert.equal(command.isSafeMeme(valid), true);
	assert.equal(command.isSafeMeme({ ...valid, nsfw: true }), false);
	assert.equal(command.isSafeMeme({ ...valid, spoiler: true }), false);
	assert.equal(command.isSafeMeme({ ...valid, url: 'http://example.com/meme.png' }), false);
});

test('memebericht bevat afbeelding en knop voor een nieuwe meme', () => {
	const message = command.memeMessage({
		title: 'Testmeme', url: 'https://example.com/meme.png', subreddit: 'memes', ups: 42,
	});
	assert.equal(message.embeds[0].data.image.url, 'https://example.com/meme.png');
	assert.equal(message.components[0].components[0].data.custom_id, 'meme:nieuw');
});
