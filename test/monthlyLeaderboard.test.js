const assert = require('node:assert/strict');
const test = require('node:test');
const { rankMonthlyTeams } = require('../utils/liveMonthlyLeaderboard');

test('each monthly team win awards exactly one leaderboard point', () => {
	const ranking = rankMonthlyTeams([
		{ district_role_id: 'team-a', points: 25 },
		{ district_role_id: 'team-a', points: 18 },
		{ district_role_id: 'team-b', points: 30 },
	]);

	assert.deepEqual(
		ranking.map(team => [team.roleId, team.leaderboardPoints]),
		[['team-a', 2], ['team-b', 1]]
	);
});
