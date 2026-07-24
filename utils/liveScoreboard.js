const { EmbedBuilder } = require('discord.js');
const { getRoleConfig } = require('./roleChoiceStore');
const { getLiveScoreboard, getScoreboard } = require('./scoreStore');

async function buildLiveScoreboardEmbed(guild) {
	const roleIds = await getRoleConfig(guild.id);

	if (!roleIds) {
		throw new Error('The five district roles have not been configured.');
	}

	const totals = new Map(
		(await getScoreboard(guild.id)).map(row => [row.district_role_id, row])
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

	const monthName = new Intl.DateTimeFormat('en-US', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC',
	}).format(new Date());
	const ranks = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

	return new EmbedBuilder()
		.setColor(0xf1c40f)
		.setTitle('🏆 Live scoreboard')
		.setDescription(
			`**${monthName}**\n\n` +
			districts.map((district, index) => {
				const winLabel = district.victories === 1 ? 'win' : 'wins';
				const killLabel = district.kills === 1 ? 'kill' : 'kills';

				return `${ranks[index] || `${index + 1}.`}  <@&${district.roleId}>\n` +
					`**${district.points} POINTS**  ·  ${district.kills} ${killLabel}  ·  ${district.victories} ${winLabel}`;
			}).join('\n\n')
		)
		.setFooter({ text: '1 kill = 1 point  •  1 win = 10 bonus points  •  Updated automatically' })
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
