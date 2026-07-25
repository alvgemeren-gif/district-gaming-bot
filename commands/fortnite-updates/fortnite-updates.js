const {
	ChannelType,
	PermissionFlagsBits,
	SlashCommandBuilder,
} = require('discord.js');
const { publishCurrentUpdates } = require('../../utils/fortniteUpdates');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('fortnite-updates')
		.setDescription('Post a live channel feed for Fortnite game updates.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addChannelOption(option =>
			option
				.setName('channel')
				.setDescription('The channel where Fortnite updates will be posted.')
				.addChannelTypes(ChannelType.GuildText)
				.setRequired(true)
		)
		.addRoleOption(option =>
			option
				.setName('notification-role')
				.setDescription('Optional role to mention when new updates arrive.')
		),

	async execute(interaction) {
		if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({ content: 'Only an administrator can configure the update feed.', ephemeral: true });
			return;
		}
		await interaction.deferReply({ ephemeral: true });
		const channel = interaction.options.getChannel('channel');
		const role = interaction.options.getRole('notification-role');
		try {
			const result = await publishCurrentUpdates(interaction.guild, channel, role?.id || null);
			await interaction.editReply(
				`The Fortnite update feed is now active in ${channel}. ${result.news} current news post(s) published; active version: **${result.version}**.`
			);
		} catch (error) {
			console.error('Fortnite updates command error:', error);
			await interaction.editReply('The Fortnite update feed could not be configured. Please try again later.');
		}
	},
};
