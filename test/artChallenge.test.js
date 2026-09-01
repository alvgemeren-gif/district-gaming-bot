const assert = require('node:assert/strict');
const test = require('node:test');
const { generatePrompt } = require('../utils/artChallenge');

test('weekly art prompts are English, deterministic, and change over time', () => {
	const week = 7 * 24 * 60 * 60 * 1000;
	const first = generatePrompt(10 * week);
	const repeated = generatePrompt(10 * week + 1000);
	const next = generatePrompt(11 * week);

	assert.equal(first, repeated);
	assert.notEqual(first, next);
	assert.match(first, /^Create an original artwork depicting /);
	assert.match(first, /Any visual medium is welcome\.$/);
});

test('art challenge commands expose the expected English interface', () => {
	const publicCommand = require('../commands/art-challenge/art-challenge').data.toJSON();
	const adminCommand = require('../commands/art-challenge-admin/art-challenge-admin').data.toJSON();

	assert.equal(publicCommand.name, 'art-challenge');
	assert.deepEqual(publicCommand.options.map(option => option.name), ['current', 'submit']);
	assert.equal(adminCommand.name, 'art-challenge-admin');
	assert.equal(adminCommand.default_member_permissions, '0');
	assert.deepEqual(adminCommand.options.map(option => option.name), ['channel']);
});
