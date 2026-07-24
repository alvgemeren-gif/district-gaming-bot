const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { getMonthlyWinners } = require('../../utils/scoreStore');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('monthly-winners')
		.setDescription('View the district winner for every completed month.'),

	async execute(interaction) {
		try {
			const winners = await getMonthlyWinners(interaction.guildId);

			if (!winners.length) {
				await interaction.reply({
					content: 'No completed monthly leaderboard has a winner yet.',
					ephemeral: true,
				});
				return;
			}

			const months = new Map();

			for (const winner of winners) {
				if (!months.has(winner.month_key)) {
					months.set(winner.month_key, []);
				}
				months.get(winner.month_key).push(winner);
			}

			const description = Array.from(months.entries())
				.slice(0, 18)
				.map(([month, monthWinners]) => {
					const lines = monthWinners.map(winner =>
						`🏆 <@&${winner.district_role_id}> — **${winner.points} points** ` +
						`(${winner.victories} wins, ${winner.kills} kills, ${winner.mission_points} mission points)`
					);
					return `**${month}**\n${lines.join('\n')}`;
				})
				.join('\n\n');
			const embed = new EmbedBuilder()
				.setColor(0xf1c40f)
				.setTitle('Monthly District Winners')
				.setDescription(description)
				.setFooter({ text: 'Monthly results are frozen after the month ends' });

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			console.error('Monthly winners error:', error);
			await interaction.reply({
				content: 'The monthly winners archive is currently unavailable.',
				ephemeral: true,
			});
		}
	},
};
