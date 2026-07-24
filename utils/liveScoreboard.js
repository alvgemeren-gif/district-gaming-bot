const { EmbedBuilder } = require('discord.js');
const { getRoleConfig } = require('./roleChoiceStore');
const { getLeaderboard, getLiveScoreboard } = require('./scoreStore');

async function buildLiveScoreboardEmbed(guild) {
	const roleIds = await getRoleConfig(guild.id);

	if (!roleIds) {
		throw new Error('The five district roles have not been configured.');
	}

	const totals = new Map(
		(await getLeaderboard(guild.id)).map(row => [row.district_role_id, row])
	);
	const districts = [];

	for (const roleId of roleIds) {
		const role = await guild.roles.fetch(roleId).catch(() => null);
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

	return new EmbedBuilder()
		.setColor(0xf1c40f)
		.setTitle('Live District Scoreboard')
		.setDescription(
			districts.map((district, index) =>
				`**${index + 1}. <@&${district.roleId}> — ${district.points} points**\n` +
				`Victory Royales: ${district.victories} × 10 · Kills: ${district.kills} × 1`
			).join('\n\n')
		)
		.setFooter({ text: 'All approved match results are combined automatically' })
		.setTimestamp();
}

async function refreshLiveScoreboard(guild) {
	const config = await getLiveScoreboard(guild.id);

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

	await message.edit({ embeds: [await buildLiveScoreboardEmbed(guild)] });
	return true;
}

module.exports = {
	buildLiveScoreboardEmbed,
	refreshLiveScoreboard,
};
