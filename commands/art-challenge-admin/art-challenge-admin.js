const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { postWeeklyChallenge } = require('../../utils/artChallenge');
const { configureGuild } = require('../../utils/artChallengeStore');

const data = new SlashCommandBuilder()
	.setName('art-challenge-admin')
	.setDescription('Configure the automatic weekly art challenge.')
	.setDefaultMemberPermissions(0)
	.addChannelOption(option => option
		.setName('channel')
		.setDescription('Channel for weekly prompts, submissions, and voting.')
		.addChannelTypes(ChannelType.GuildText)
		.setRequired(true));

module.exports = {
	data,

	async execute(interaction) {
		if (interaction.user.id !== interaction.guild.ownerId) {
			await interaction.reply({ content: 'Only the server owner can use this command.', ephemeral: true });
			return;
		}
		if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.SendMessages)) {
			await interaction.reply({ content: 'I need permission to send messages before this can be configured.', ephemeral: true });
			return;
		}

		await interaction.deferReply({ ephemeral: true });
		try {
			const channel = interaction.options.getChannel('channel');
			const config = await configureGuild(interaction.guildId, channel.id);
			await postWeeklyChallenge(interaction.client, config);
			await interaction.editReply(`Weekly art challenges are now active in ${channel}. The first challenge has been posted.`);
		} catch (error) {
			console.error('Could not configure art challenge:', error);
			await interaction.editReply('The art challenge could not be configured. Check the database and channel permissions.');
		}
	},
};
