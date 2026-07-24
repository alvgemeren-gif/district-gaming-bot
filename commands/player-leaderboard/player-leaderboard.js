const {
	EmbedBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
} = require('discord.js');
const {
	getCurrentPlayerScoreboard,
	getPlayerMonthlyHistory,
	getPlayerMonthlyWinners,
	setLivePlayerLeaderboard,
} = require('../../utils/scoreStore');
const {
	buildLivePlayerLeaderboardEmbed,
	formatPlayerRanking,
} = require('../../utils/livePlayerLeaderboard');

const data = new SlashCommandBuilder()
	.setName('player-leaderboard')
	.setDescription('View monthly kills and wins per member.')
	.addSubcommand(subcommand =>
		subcommand.setName('month').setDescription('View this month’s member leaderboard.')
	)
	.addSubcommand(subcommand =>
		subcommand.setName('history').setDescription('View all completed-month wins per member.')
	)
	.addSubcommand(subcommand =>
		subcommand.setName('winners').setDescription('View the kill and win leaders of completed months.')
	);

function monthName() {
	return new Intl.DateTimeFormat('en-US', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC',
	}).format(new Date());
}

function medal(index) {
	return ['🥇', '🥈', '🥉'][index] || `**${index + 1}.**`;
}

function limitDescription(value) {
	return value.length <= 4096 ? value : `${value.slice(0, 4075)}\n\n…more results`;
}

module.exports = {
	data,
	formatRanking: formatPlayerRanking,

	async execute(interaction) {
		try {
			const subcommand = interaction.options.getSubcommand();

			if (subcommand === 'panel') {
				if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
					await interaction.reply({
						content: 'Only a server administrator can post the live leaderboard.',
						ephemeral: true,
					});
					return;
				}

				const channel = interaction.options.getChannel('channel') || interaction.channel;
				const message = await channel.send({
					embeds: [await buildLivePlayerLeaderboardEmbed(interaction.guildId)],
				});
				await setLivePlayerLeaderboard(interaction.guildId, channel.id, message.id);
				await interaction.reply({
					content: `The live member leaderboard has been posted in ${channel}.`,
					ephemeral: true,
				});
				return;
			}

			if (subcommand === 'month') {
				const rows = await getCurrentPlayerScoreboard(interaction.guildId);

				if (!rows.length) {
					await interaction.reply({ content: 'There are no approved scores this month yet.', ephemeral: true });
					return;
				}

				await interaction.reply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xf1c40f)
							.setTitle(`🏆 Member leaderboard — ${monthName()}`)
							.addFields(
								{ name: '👑 Most wins', value: formatPlayerRanking(rows, 'victories') },
								{ name: '🎯 Most kills', value: formatPlayerRanking(rows, 'kills') }
							)
							.setFooter({ text: 'Only approved match submissions count · UTC month' })
							.setTimestamp(),
					],
				});
				return;
			}

			if (subcommand === 'history') {
				const rows = await getPlayerMonthlyHistory(interaction.guildId);

				if (!rows.length) {
					await interaction.reply({
						content: 'There are no completed months with member scores yet.',
						ephemeral: true,
					});
					return;
				}

				const description = rows.slice(0, 20).map((row, index) =>
					`${medal(index)} <@${row.user_id}> — **${row.victories} wins**\n` +
					`${row.kills} kills · ${row.months_played} months · ` +
					`${row.monthly_win_titles}× most wins · ${row.monthly_kill_titles}× most kills`
				).join('\n\n');
				await interaction.reply({
					embeds: [
						new EmbedBuilder()
							.setColor(0x5865f2)
							.setTitle('All-time monthly member leaderboard')
							.setDescription(limitDescription(description))
							.setFooter({ text: 'Ranked by total wins from completed months' }),
					],
				});
				return;
			}

			const winners = await getPlayerMonthlyWinners(interaction.guildId);

			if (!winners.length) {
				await interaction.reply({
					content: 'There are no completed months with winners yet.',
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
						.setTitle('Monthly member winners')
						.setDescription(limitDescription(description)),
				],
			});
		} catch (error) {
			console.error('Player leaderboard error:', error);
			const response = {
				content: 'The member leaderboard is currently unavailable.',
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
