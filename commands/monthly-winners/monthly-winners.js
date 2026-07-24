const { SlashCommandBuilder } = require('discord.js');
const { setLiveMonthlyLeaderboard } = require('../../utils/scoreStore');
const { buildLiveMonthlyLeaderboardEmbed } = require('../../utils/liveMonthlyLeaderboard');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('monthly-winners')
		.setDescription('Post the live team leaderboard with one point per monthly win.'),

	async execute(interaction) {
		try {
			await interaction.reply({
				embeds: [await buildLiveMonthlyLeaderboardEmbed(interaction.guildId)],
			});
			const message = await interaction.fetchReply();
			await setLiveMonthlyLeaderboard(interaction.guildId, interaction.channelId, message.id);
		} catch (error) {
			console.error('Monthly winners error:', error);
			const response = {
				content: 'The monthly team leaderboard is currently unavailable.',
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
