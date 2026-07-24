const {
	ChannelType,
	PermissionFlagsBits,
	SlashCommandBuilder,
} = require('discord.js');
const levelCommand = require('../level/level');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('level-admin')
		.setDescription('Manage level rewards and settings.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand(subcommand =>
			subcommand
				.setName('reward-add')
				.setDescription('Add a role reward to a level.')
				.addIntegerOption(option =>
					option.setName('level').setDescription('The required level.').setMinValue(1).setMaxValue(1000).setRequired(true)
				)
				.addRoleOption(option =>
					option.setName('role').setDescription('The role to award.').setRequired(true)
				)
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('reward-remove')
				.setDescription('Remove a role reward from a level.')
				.addIntegerOption(option =>
					option.setName('level').setDescription('The reward level.').setMinValue(1).setMaxValue(1000).setRequired(true)
				)
				.addRoleOption(option =>
					option.setName('role').setDescription('Leave empty to remove every reward from this level.')
				)
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('channel')
				.setDescription('Configure the level-up announcement channel.')
				.addChannelOption(option =>
					option
						.setName('channel')
						.setDescription('Leave empty to announce in the active channel.')
						.addChannelTypes(ChannelType.GuildText)
				)
		),

	execute: levelCommand.execute,
};
