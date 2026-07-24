const { EmbedBuilder } = require('discord.js');
const { getLiveMonthlyLeaderboard, getMonthlyWinners } = require('./scoreStore');

function rankMonthlyTeams(winners) {
	const teams = new Map();

	for (const winner of winners) {
		const team = teams.get(winner.district_role_id) || {
			roleId: winner.district_role_id,
			leaderboardPoints: 0,
			scoredPoints: 0,
		};
		team.leaderboardPoints += 1;
		team.scoredPoints += Number(winner.points);
		teams.set(winner.district_role_id, team);
	}

	return [...teams.values()].sort((a, b) =>
		b.leaderboardPoints - a.leaderboardPoints ||
		b.scoredPoints - a.scoredPoints ||
		a.roleId.localeCompare(b.roleId)
	);
}

async function buildLiveMonthlyLeaderboardEmbed(guildId) {
	const ranking = rankMonthlyTeams(await getMonthlyWinners(guildId));
	const ranks = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
	const description = ranking.length
		? ranking.map((team, index) => {
			const label = team.leaderboardPoints === 1 ? 'punt' : 'punten';
			return `${ranks[index] || `${index + 1}.`} <@&${team.roleId}> — **${team.leaderboardPoints} ${label}**`;
		}).join('\n\n')
		: 'Nog geen maand afgerond. Dit bericht wordt automatisch bijgewerkt.';

	return new EmbedBuilder()
		.setColor(0x9b59b6)
		.setTitle('🏅 Teamleaderboard')
		.setDescription(description)
		.setFooter({ text: 'Maand gewonnen = 1 leaderboardpunt · Automatisch bijgewerkt' })
		.setTimestamp();
}

async function refreshLiveMonthlyLeaderboard(guild) {
	const config = await getLiveMonthlyLeaderboard(guild.id);

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

	await message.edit({ embeds: [await buildLiveMonthlyLeaderboardEmbed(guild.id)] });
	return true;
}

module.exports = {
	buildLiveMonthlyLeaderboardEmbed,
	rankMonthlyTeams,
	refreshLiveMonthlyLeaderboard,
};
