const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { getRoleConfig } = require('../../utils/roleChoiceStore');
const { getLeaderboard } = require('../../utils/scoreStore');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('points')
		.setDescription('View the current points for all five district roles.'),

	async execute(interaction) {
		try {
			const roleIds = await getRoleConfig(interaction.guildId);

			if (!roleIds) {
				await interaction.reply({
					content: 'The five district roles have not been configured yet.',
					ephemeral: true,
				});
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
					roleId,
					name: role?.name || 'Deleted district role',
					points: Number(total.points),
					victories: Number(total.victories),
					kills: Number(total.kills),
				});
			}

			districts.sort((a, b) =>
				b.points - a.points || b.victories - a.victories || b.kills - a.kills
			);

			const embed = new EmbedBuilder()
				.setColor(0x5865f2)
				.setTitle('District Points')
				.setDescription(
					districts.map((district, index) =>
						`**${index + 1}. <@&${district.roleId}> — ${district.points} points**\n` +
						`Victory Royales: ${district.victories} · Kills: ${district.kills}`
					).join('\n\n')
				)
				.setFooter({ text: 'Score = Victory Royales × 10 + kills' })
				.setTimestamp();

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			console.error('Points command error:', error);
			await interaction.reply({
				content: 'The district points are currently unavailable.',
				ephemeral: true,
			});
		}
	},
};
