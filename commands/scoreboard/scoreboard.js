const { SlashCommandBuilder } = require('discord.js');
const { buildLiveScoreboardEmbed } = require('../../utils/liveScoreboard');
const { setLiveScoreboard } = require('../../utils/scoreStore');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('scoreboard')
		.setDescription('Post the automatically updating monthly district scoreboard.'),

	async execute(interaction) {
		try {
			await interaction.reply({
				embeds: [await buildLiveScoreboardEmbed(interaction.guild)],
			});
			const message = await interaction.fetchReply();
			await setLiveScoreboard(interaction.guildId, interaction.channelId, message.id);
		} catch (error) {
			console.error('Scoreboard error:', error);
			const response = {
				content: 'The scoreboard database is unavailable.',
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
