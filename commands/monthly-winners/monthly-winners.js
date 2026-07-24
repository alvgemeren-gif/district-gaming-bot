const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { getMonthlyWinners } = require('../../utils/scoreStore');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('monthly-winners')
		.setDescription('View the all-time leaderboard of monthly district winners.'),

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

			const champions = new Map();

			for (const winner of winners) {
				if (!champions.has(winner.district_role_id)) {
					champions.set(winner.district_role_id, {
						roleId: winner.district_role_id,
						titles: 0,
						winningPoints: 0,
						victories: 0,
						kills: 0,
						months: [],
					});
				}
				const champion = champions.get(winner.district_role_id);
				champion.titles += 1;
				champion.winningPoints += Number(winner.points);
				champion.victories += Number(winner.victories);
				champion.kills += Number(winner.kills);
				champion.months.push(winner.month_key);
			}

			const ranking = Array.from(champions.values())
				.sort((a, b) =>
					b.titles - a.titles ||
					b.winningPoints - a.winningPoints ||
					b.victories - a.victories ||
					b.kills - a.kills
				);
			const description = ranking
				.map((champion, index) =>
					`**${index + 1}. <@&${champion.roleId}> — ${champion.titles} monthly title${champion.titles === 1 ? '' : 's'}**\n` +
					`Winning-month points: ${champion.winningPoints} · Victories: ${champion.victories} · Kills: ${champion.kills}\n` +
					`Months won: ${champion.months.join(', ')}`
				)
				.join('\n\n');
			const embed = new EmbedBuilder()
				.setColor(0xf1c40f)
				.setTitle('Monthly Champions Leaderboard')
				.setDescription(description)
				.setFooter({ text: 'Ranked by monthly titles, then total points earned in winning months' });

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
