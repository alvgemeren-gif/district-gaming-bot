const {
	ChannelType,
	PermissionFlagsBits,
	SlashCommandBuilder,
} = require('discord.js');
const ticketCommand = require('../ticket/ticket');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ticket-admin')
		.setDescription('Manage ticket panels.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand(subcommand =>
			subcommand
				.setName('panel-create')
				.setDescription('Create and post a new ticket panel.')
				.addStringOption(option =>
					option.setName('title').setDescription('Panel title.').setMaxLength(256).setRequired(true)
				)
				.addStringOption(option =>
					option
						.setName('description')
						.setDescription('Panel text; use \\n for a new line.')
						.setMaxLength(4000)
						.setRequired(true)
				)
				.addStringOption(option =>
					option.setName('button-label').setDescription('Text shown on the ticket button.').setMaxLength(80).setRequired(true)
				)
				.addChannelOption(option =>
					option
						.setName('category')
						.setDescription('Category where tickets will be created.')
						.addChannelTypes(ChannelType.GuildCategory)
						.setRequired(true)
				)
				.addRoleOption(option =>
					option.setName('support-role').setDescription('Role that can view the tickets.').setRequired(true)
				)
				.addChannelOption(option =>
					option
						.setName('channel')
						.setDescription('Channel where the panel will be posted.')
						.addChannelTypes(ChannelType.GuildText)
				)
				.addStringOption(option =>
					option.setName('color').setDescription('Hex color, for example #5865F2.').setMinLength(6).setMaxLength(7)
				)
		)
			.addSubcommand(subcommand =>
				subcommand.setName('panels').setDescription('View all configured ticket panels.')
			)
			.addSubcommand(subcommand =>
				subcommand
					.setName('standard-panels')
					.setDescription('Post the Partner, Applications, Help and Questions panels.')
					.addChannelOption(option =>
						option
							.setName('category')
							.setDescription('Category where tickets will be created.')
							.addChannelTypes(ChannelType.GuildCategory)
							.setRequired(true)
					)
					.addRoleOption(option =>
						option.setName('support-role').setDescription('Role that can view the tickets.').setRequired(true)
					)
					.addChannelOption(option =>
						option
							.setName('channel')
							.setDescription('Channel where the panels will be posted.')
							.addChannelTypes(ChannelType.GuildText)
					)
			),

	execute: ticketCommand.execute,
};
