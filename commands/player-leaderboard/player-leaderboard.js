const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const {
	getCurrentPlayerScoreboard,
	getPlayerMonthlyHistory,
	getPlayerMonthlyWinners,
} = require('../../utils/scoreStore');

const data = new SlashCommandBuilder()
	.setName('player-leaderboard')
	.setDescription('Bekijk maandelijkse kills en wins per lid.')
	.addSubcommand(subcommand =>
		subcommand.setName('maand').setDescription('Bekijk de ledenranglijst van deze maand.')
	)
	.addSubcommand(subcommand =>
		subcommand.setName('historie').setDescription('Bekijk alle maandelijkse wins per lid bij elkaar.')
	)
	.addSubcommand(subcommand =>
		subcommand.setName('winnaars').setDescription('Bekijk de kill- en winwinnaars van afgesloten maanden.')
	);

function monthName() {
	return new Intl.DateTimeFormat('nl-NL', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC',
	}).format(new Date());
}

function medal(index) {
	return ['🥇', '🥈', '🥉'][index] || `**${index + 1}.**`;
}

function formatRanking(rows, primaryField, limit = 10) {
	return [...rows]
		.sort((a, b) =>
			Number(b[primaryField]) - Number(a[primaryField]) ||
			Number(b.victories) - Number(a.victories) ||
			Number(b.kills) - Number(a.kills) ||
			a.user_id.localeCompare(b.user_id)
		)
		.slice(0, limit)
		.map((row, index) =>
			`${medal(index)} <@${row.user_id}> — **${row.victories} wins** · ${row.kills} kills`
		)
		.join('\n');
}

function limitDescription(value) {
	return value.length <= 4096 ? value : `${value.slice(0, 4075)}\n\n…meer resultaten`;
}

module.exports = {
	data,
	formatRanking,

	async execute(interaction) {
		try {
			const subcommand = interaction.options.getSubcommand();

			if (subcommand === 'maand') {
				const rows = await getCurrentPlayerScoreboard(interaction.guildId);

				if (!rows.length) {
					await interaction.reply({ content: 'Er zijn deze maand nog geen goedgekeurde scores.', ephemeral: true });
					return;
				}

				await interaction.reply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xf1c40f)
							.setTitle(`🏆 Ledenleaderboard — ${monthName()}`)
							.addFields(
								{ name: '👑 Meeste wins', value: formatRanking(rows, 'victories') },
								{ name: '🎯 Meeste kills', value: formatRanking(rows, 'kills') }
							)
							.setFooter({ text: 'Alleen goedgekeurde match-submissions tellen mee · UTC-maand' })
							.setTimestamp(),
					],
				});
				return;
			}

			if (subcommand === 'historie') {
				const rows = await getPlayerMonthlyHistory(interaction.guildId);

				if (!rows.length) {
					await interaction.reply({
						content: 'Er zijn nog geen afgesloten maanden met ledenscores.',
						ephemeral: true,
					});
					return;
				}

				const description = rows.slice(0, 20).map((row, index) =>
					`${medal(index)} <@${row.user_id}> — **${row.victories} wins**\n` +
					`${row.kills} kills · ${row.months_played} maanden · ` +
					`${row.monthly_win_titles}× meeste wins · ${row.monthly_kill_titles}× meeste kills`
				).join('\n\n');
				await interaction.reply({
					embeds: [
						new EmbedBuilder()
							.setColor(0x5865f2)
							.setTitle('All-time maandleaderboard per lid')
							.setDescription(limitDescription(description))
							.setFooter({ text: 'Gerangschikt op totaal aantal wins uit afgesloten maanden' }),
					],
				});
				return;
			}

			const winners = await getPlayerMonthlyWinners(interaction.guildId);

			if (!winners.length) {
				await interaction.reply({
					content: 'Er zijn nog geen afgesloten maanden met winnaars.',
					ephemeral: true,
				});
				return;
			}

			const months = new Map();

			for (const winner of winners) {
				if (!months.has(winner.month_key)) months.set(winner.month_key, []);
				months.get(winner.month_key).push(winner);
			}

			const description = [...months].map(([month, entries]) => {
				const winLeaders = entries
					.filter(entry => entry.win_rank === 1)
					.map(entry => `<@${entry.user_id}> (${entry.victories})`)
					.join(', ');
				const killLeaders = entries
					.filter(entry => entry.kill_rank === 1)
					.map(entry => `<@${entry.user_id}> (${entry.kills})`)
					.join(', ');
				return `**${month}**\n👑 Wins: ${winLeaders}\n🎯 Kills: ${killLeaders}`;
			}).join('\n\n');

			await interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setTitle('Maandelijkse ledenwinnaars')
						.setDescription(limitDescription(description)),
				],
			});
		} catch (error) {
			console.error('Player leaderboard error:', error);
			const response = {
				content: 'Het ledenleaderboard kan momenteel niet worden geladen.',
				ephemeral: true,
			};

			if (interaction.replied || interaction.deferred) {
				await interaction.followUp(response).catch(() => {});
			} else {
				await interaction.reply(response).catch(() => {});
			}
		}
	},
};
