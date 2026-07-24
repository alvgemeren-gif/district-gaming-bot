const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { getRoleConfig } = require('../../utils/roleChoiceStore');
const { getLeaderboard } = require('../../utils/scoreStore');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('leaderboard')
		.setDescription('View the live district points leaderboard.'),

	async execute(interaction) {
		try {
			const roleIds = await getRoleConfig(interaction.guildId);

			if (!roleIds) {
				await interaction.reply({ content: 'The five districts have not been configured.', ephemeral: true });
				return;
			}

			const totals = new Map(
				(await getLeaderboard(interaction.guildId)).map(row => [row.district_role_id, row])
			);
			const districts = [];

			for (const roleId of roleIds) {
				const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
				const total = totals.get(roleId) || { points: 0, victories: 0, kills: 0 };
				districts.push({
					name: role?.name || `Deleted district (${roleId})`,
					points: Number(total.points),
					victories: Number(total.victories),
					kills: Number(total.kills),
				});
			}

			districts.sort((a, b) =>
				b.points - a.points || b.victories - a.victories || b.kills - a.kills
			);

			const lines = districts.map((district, index) =>
				`**${index + 1}. ${district.name}** — ${district.points} points\n` +
				`Victories: ${district.victories} · Kills: ${district.kills}`
			);
			const embed = new EmbedBuilder()
				.setColor(0xf1c40f)
				.setTitle('District Leaderboard')
				.setDescription(lines.join('\n\n'))
				.setFooter({ text: 'Score = Victory Royales × 10 + kills' })
				.setTimestamp();

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			console.error('Leaderboard error:', error);
			await interaction.reply({
				content: 'The leaderboard database is unavailable.',
				ephemeral: true,
			});
		}
	},
};
