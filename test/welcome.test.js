const assert = require('node:assert/strict');
const test = require('node:test');
const welcomeCommand = require('../commands/welcome/welcome');
const { formatWelcomeMessage } = require('../utils/welcomeConfig');

test('circus welcome preset uses all supported member placeholders', () => {
	const member = {
		toString: () => '<@123>',
		user: { username: 'Pipo' },
		guild: { name: 'Cozy Circus', memberCount: 42 },
	};
	const message = formatWelcomeMessage(welcomeCommand.CIRCUS_WELCOME_MESSAGE, member);

	assert.match(message, /🎪/);
	assert.match(message, /🤡/);
	assert.match(message, /<@123>/);
	assert.match(message, /Cozy Circus/);
	assert.match(message, /42/);
	assert.match(message, /Pipo/);
	assert.doesNotMatch(message, /\{(?:user|username|server|membercount)\}/);
});

test('welcome command exposes the circus preset', () => {
	const command = welcomeCommand.data.toJSON();
	assert.ok(command.options.some(option => option.name === 'circus'));
});
