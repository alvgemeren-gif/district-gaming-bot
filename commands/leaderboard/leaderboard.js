const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { getLevelLeaderboard } = require('../../utils/levelSystem');

const MEDALS = ['🥇', '🥈', '🥉'];

function leaderboardDescription(entries) {
	if (!entries.length) return 'Er is nog geen XP verdiend.';
	return entries.map((entry, index) =>
		`${MEDALS[index] || `**${index + 1}.**`} <@${entry.userId}> — ` +
		`level **${entry.level}** • **${entry.xp.toLocaleString('nl-NL')} XP**`
	).join('\n');
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('leaderboard')
		.setDescription('Bekijk de leden met de meeste XP en hoogste levels.'),

	async execute(interaction) {
		const entries = getLevelLeaderboard(interaction.guildId, 10);
		await interaction.reply({
			embeds: [new EmbedBuilder()
				.setColor(0xf1c40f)
				.setTitle('🏆 Level leaderboard')
				.setDescription(leaderboardDescription(entries))
				.setFooter({ text: 'Gebruik /rank om je eigen positie en voortgang te bekijken.' })],
		});
	},

	leaderboardDescription,
};
