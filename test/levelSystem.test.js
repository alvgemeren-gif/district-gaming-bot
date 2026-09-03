const assert = require('node:assert/strict');
const test = require('node:test');
const { eligibleVoiceMembers, levelFromXp, VOICE_XP_INTERVAL_MS, XP_PER_VOICE_INTERVAL, xpForLevel } = require('../utils/levelSystem');

test('level commands expose member and administrator actions', () => {
	const publicCommand = require('../commands/level/level').data.toJSON();
	const adminCommand = require('../commands/level-admin/level-admin').data.toJSON();

	assert.equal(publicCommand.name, 'level');
	assert.deepEqual(
		publicCommand.options.map(option => option.name),
		['rank', 'leaderboard', 'rewards']
	);
	assert.equal(adminCommand.name, 'level-admin');
	assert.equal(adminCommand.default_member_permissions, '8');
	assert.deepEqual(
		adminCommand.options.map(option => option.name),
		['reward-add', 'reward-remove', 'channel']
	);
});

test('level thresholds grow quadratically', () => {
	assert.equal(xpForLevel(0), 0);
	assert.equal(xpForLevel(1), 100);
	assert.equal(xpForLevel(2), 400);
	assert.equal(xpForLevel(10), 10000);
});

test('XP is converted to the correct level at boundaries', () => {
	assert.equal(levelFromXp(0), 0);
	assert.equal(levelFromXp(99), 0);
	assert.equal(levelFromXp(100), 1);
	assert.equal(levelFromXp(399), 1);
	assert.equal(levelFromXp(400), 2);
});

test('voice XP selects connected human members outside the AFK channel', () => {
	const human = { id: 'human', user: { bot: false } };
	const bot = { id: 'bot', user: { bot: true } };
	const afk = { id: 'afk-user', user: { bot: false } };
	const disconnected = { id: 'offline', user: { bot: false } };
	const guild = {
		afkChannelId: 'afk',
		voiceStates: { cache: new Map([
			['human', { channelId: 'general', member: human }],
			['bot', { channelId: 'general', member: bot }],
			['afk', { channelId: 'afk', member: afk }],
			['offline', { channelId: null, member: disconnected }],
		]) },
	};
	assert.deepEqual(eligibleVoiceMembers(guild), [human]);
	assert.equal(XP_PER_VOICE_INTERVAL, 10);
	assert.equal(VOICE_XP_INTERVAL_MS, 5 * 60 * 1000);
});
