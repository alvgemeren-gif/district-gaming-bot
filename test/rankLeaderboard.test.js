const assert = require('node:assert/strict');
const test = require('node:test');
const rankCommand = require('../commands/rank/rank');
const leaderboardCommand = require('../commands/leaderboard/leaderboard');

test('rank en leaderboard zijn zelfstandige publieke commando’s', () => {
	const rank = rankCommand.data.toJSON();
	const leaderboard = leaderboardCommand.data.toJSON();
	assert.equal(rank.name, 'rank');
	assert.equal(rank.options[0].name, 'lid');
	assert.equal(rank.default_member_permissions, undefined);
	assert.equal(leaderboard.name, 'leaderboard');
	assert.equal(leaderboard.default_member_permissions, undefined);
});

test('rankkaart toont level, XP en leaderboardpositie', () => {
	const user = { username: 'Speler', displayAvatarURL: () => 'https://example.com/avatar.png' };
	const embed = rankCommand.buildRankEmbed(user, {
		xp: 625, level: 2, currentLevelXp: 400, nextLevelXp: 900,
	}, { position: 4, total: 20 }).toJSON();

	assert.match(embed.title, /Level 2.*Rank #4/);
	assert.equal(embed.fields[0].value, '625');
	assert.equal(embed.fields[2].value, '#4 van 20');
});

test('leaderboard sorteervolgorde wordt duidelijk genummerd', () => {
	const description = leaderboardCommand.leaderboardDescription([
		{ userId: '1', level: 5, xp: 2500 },
		{ userId: '2', level: 3, xp: 1200 },
	]);
	assert.match(description, /^🥇 <@1>/);
	assert.match(description, /🥈 <@2>/);
});
