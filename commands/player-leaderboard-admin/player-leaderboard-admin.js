const {
	ChannelType,
	PermissionFlagsBits,
	SlashCommandBuilder,
} = require('discord.js');
const playerLeaderboardCommand = require('../player-leaderboard/player-leaderboard');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('player-leaderboard-admin')
		.setDescription('Manage the live member leaderboard.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand(subcommand =>
			subcommand
				.setName('panel')
				.setDescription('Post a member leaderboard that updates automatically.')
				.addChannelOption(option =>
					option
						.setName('channel')
						.setDescription('Channel where the live leaderboard will be posted.')
						.addChannelTypes(ChannelType.GuildText)
				)
		),

	execute: playerLeaderboardCommand.execute,
};
