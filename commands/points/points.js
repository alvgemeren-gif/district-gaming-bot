const { SlashCommandBuilder } = require('discord.js');
const { buildLiveScoreboardEmbed } = require('../../utils/liveScoreboard');
const { setLiveScoreboard } = require('../../utils/scoreStore');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('points')
		.setDescription('Post the automatically updating district points.'),

	async execute(interaction) {
		try {
			await interaction.reply({
				embeds: [await buildLiveScoreboardEmbed(interaction.guild)],
			});
			const message = await interaction.fetchReply();
			await setLiveScoreboard(interaction.guildId, interaction.channelId, message.id);
		} catch (error) {
			console.error('Points command error:', error);
			const response = {
				content: 'The district points are currently unavailable.',
				ephemeral: true,
			};

			if (interaction.replied || interaction.deferred) {
				await interaction.followUp(response).catch(() => {});
			} else {
				await interaction.reply(response);
			}
		}
	},
};
