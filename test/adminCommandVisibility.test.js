const assert = require('node:assert/strict');
const test = require('node:test');

const adminCommands = [
	require('../commands/autorole/autorole').data,
	require('../commands/create/create').data,
	require('../commands/embed/embed').data,
	require('../commands/level-admin/level-admin').data,
	require('../commands/player-leaderboard-admin/player-leaderboard-admin').data,
	require('../commands/score-admin/score-admin').data,
	require('../commands/ticket-admin/ticket-admin').data,
	require('../commands/welcome/welcome').data,
];

test('admin-only commands require Administrator permission by default', () => {
	for (const builder of adminCommands) {
		const command = builder.toJSON();
		assert.equal(
			command.default_member_permissions,
			'8',
			`${command.name} must be hidden from non-administrators`
		);
	}
});

test('choice-roles is disabled by default so it can be granted only to the server owner', () => {
	const command = require('../commands/rollen/rollen').data.toJSON();
	assert.equal(command.name, 'choice-roles');
	assert.equal(command.default_member_permissions, '0');
});

test('public commands do not expose admin-only subcommands', () => {
	const publicCommands = [
		require('../commands/level/level').data,
		require('../commands/player-leaderboard/player-leaderboard').data,
		require('../commands/ticket/ticket').data,
	].map(builder => builder.toJSON());
	const names = publicCommands.flatMap(command =>
		command.options.map(option => `${command.name} ${option.name}`)
	);

	assert.deepEqual(names, [
		'level rank',
		'level leaderboard',
		'level rewards',
		'player-leaderboard month',
		'player-leaderboard history',
		'player-leaderboard winners',
		'ticket close',
	]);
});
