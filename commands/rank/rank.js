const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { getUserLevel, getUserRank } = require('../../utils/levelSystem');

function progressBar(current, maximum, size = 12) {
	const ratio = maximum > 0 ? Math.min(Math.max(current / maximum, 0), 1) : 1;
	const filled = Math.round(ratio * size);
	return `${'▰'.repeat(filled)}${'▱'.repeat(size - filled)}`;
}

function buildRankEmbed(user, levelData, ranking) {
	const earned = levelData.xp - levelData.currentLevelXp;
	const required = levelData.nextLevelXp - levelData.currentLevelXp;
	return new EmbedBuilder()
		.setColor(0x5865f2)
		.setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
		.setTitle(`Level ${levelData.level} • ${ranking.position ? `Rank #${ranking.position}` : 'Nog niet gerankt'}`)
		.setDescription(
			`${progressBar(earned, required)}\n` +
			`**${earned.toLocaleString('nl-NL')} / ${required.toLocaleString('nl-NL')} XP** naar level ${levelData.level + 1}`
		)
		.addFields(
			{ name: 'Totale XP', value: levelData.xp.toLocaleString('nl-NL'), inline: true },
			{ name: 'Level', value: String(levelData.level), inline: true },
			{
				name: 'Leaderboard',
				value: ranking.position ? `#${ranking.position} van ${ranking.total}` : 'Verdien XP om op de ranking te komen',
				inline: true,
			},
		);
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('rank')
		.setDescription('Bekijk je XP, level en positie op het leaderboard.')
		.addUserOption(option => option
			.setName('lid')
			.setDescription('Bekijk de rank van een ander lid.')),

	async execute(interaction) {
		const user = interaction.options.getUser('lid') || interaction.user;
		const levelData = getUserLevel(interaction.guildId, user.id);
		const ranking = getUserRank(interaction.guildId, user.id);
		await interaction.reply({ embeds: [buildRankEmbed(user, levelData, ranking)] });
	},

	buildRankEmbed,
	progressBar,
};
