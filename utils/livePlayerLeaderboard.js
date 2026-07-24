const { EmbedBuilder } = require('discord.js');
const {
	getCurrentPlayerScoreboard,
	getLivePlayerLeaderboard,
} = require('./scoreStore');

function medal(index) {
	return ['🥇', '🥈', '🥉'][index] || `**${index + 1}.**`;
}

function formatPlayerRanking(rows, primaryField, limit = 10) {
	const ranking = [...rows]
		.sort((a, b) =>
			Number(b[primaryField]) - Number(a[primaryField]) ||
			Number(b.victories) - Number(a.victories) ||
			Number(b.kills) - Number(a.kills) ||
			a.user_id.localeCompare(b.user_id)
		)
		.slice(0, limit);

	if (!ranking.length) {
		return 'No approved scores yet.';
	}

	return ranking.map((row, index) =>
		`${medal(index)} <@${row.user_id}> — **${row.victories} wins** · ${row.kills} kills`
	).join('\n');
}

async function buildLivePlayerLeaderboardEmbed(guildId) {
	const rows = await getCurrentPlayerScoreboard(guildId);
	const month = new Intl.DateTimeFormat('en-US', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC',
	}).format(new Date());

	return new EmbedBuilder()
		.setColor(0xf1c40f)
		.setTitle(`🏆 Live member leaderboard — ${month}`)
		.addFields(
			{ name: '👑 Most wins', value: formatPlayerRanking(rows, 'victories') },
			{ name: '🎯 Most kills', value: formatPlayerRanking(rows, 'kills') }
		)
		.setFooter({ text: 'Only approved match submissions count · Updated automatically · UTC month' })
		.setTimestamp();
}

async function refreshLivePlayerLeaderboard(guild) {
	const config = await getLivePlayerLeaderboard(guild.id);

	if (!config) {
		return false;
	}

	const channel = await guild.channels.fetch(config.channel_id).catch(() => null);

	if (!channel?.isTextBased()) {
		return false;
	}

	const message = await channel.messages.fetch(config.message_id).catch(() => null);

	if (!message) {
		return false;
	}

	await message.edit({ embeds: [await buildLivePlayerLeaderboardEmbed(guild.id)] });
	return true;
}

module.exports = {
	buildLivePlayerLeaderboardEmbed,
	formatPlayerRanking,
	refreshLivePlayerLeaderboard,
};
