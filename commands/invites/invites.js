const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const {
	getInviteCount,
	getInviteLeaderboard,
	getInviteRewards,
} = require('../../utils/inviteSystem');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('invites')
		.setDescription('Bekijk hoeveel leden iemand heeft uitgenodigd.')
		.addSubcommand(subcommand =>
			subcommand
				.setName('aantal')
				.setDescription('Bekijk het aantal actieve uitnodigingen.')
				.addUserOption(option =>
					option.setName('lid').setDescription('Het lid dat je wilt bekijken.')
				)
		)
		.addSubcommand(subcommand =>
			subcommand.setName('leaderboard').setDescription('Bekijk de beste uitnodigers.')
		)
		.addSubcommand(subcommand =>
			subcommand.setName('beloningen').setDescription('Bekijk alle ingestelde rolbeloningen.')
		),

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === 'aantal') {
			const user = interaction.options.getUser('lid') || interaction.user;
			const count = getInviteCount(interaction.guildId, user.id);
			await interaction.reply(`${user} heeft **${count}** actief lid${count === 1 ? '' : 'en'} uitgenodigd.`);
			return;
		}

		if (subcommand === 'leaderboard') {
			const entries = getInviteLeaderboard(interaction.guildId);
			const description = entries.length
				? entries.map((entry, index) =>
					`**${index + 1}.** <@${entry.userId}> — **${entry.count}** uitnodiging${entry.count === 1 ? '' : 'en'}`
				).join('\n')
				: 'Er zijn nog geen uitnodigingen bijgehouden.';
			await interaction.reply({
				embeds: [new EmbedBuilder().setColor(0x57f287).setTitle('Invite leaderboard').setDescription(description)],
			});
			return;
		}

		const rewards = Object.entries(getInviteRewards(interaction.guildId))
			.sort(([a], [b]) => Number(a) - Number(b));
		await interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setColor(0x5865f2)
					.setTitle('Invitebeloningen')
					.setDescription(rewards.length
						? rewards.map(([count, roleIds]) =>
							`**${count} invites:** ${roleIds.map(roleId => `<@&${roleId}>`).join(', ')}`
						).join('\n')
						: 'Er zijn nog geen rolbeloningen ingesteld.'),
			],
		});
	},
};
