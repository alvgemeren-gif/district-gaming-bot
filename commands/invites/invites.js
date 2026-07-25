const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const {
	getInviteCount,
	getInviteLeaderboard,
	getInviteRewards,
} = require('../../utils/inviteSystem');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('invites')
		.setDescription('View how many active members someone has invited.')
		.addSubcommand(subcommand =>
			subcommand
				.setName('count')
				.setDescription('View the number of active invited members.')
				.addUserOption(option =>
					option.setName('member').setDescription('The member whose invite count you want to view.')
				)
		)
		.addSubcommand(subcommand =>
			subcommand.setName('leaderboard').setDescription('View the top inviters.')
		)
		.addSubcommand(subcommand =>
			subcommand.setName('rewards').setDescription('View all configured invite role rewards.')
		),

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === 'count') {
			const user = interaction.options.getUser('member') || interaction.user;
			const count = getInviteCount(interaction.guildId, user.id);
			await interaction.reply(`${user} has invited **${count}** active member${count === 1 ? '' : 's'}.`);
			return;
		}

		if (subcommand === 'leaderboard') {
			const entries = getInviteLeaderboard(interaction.guildId);
			const description = entries.length
				? entries.map((entry, index) =>
					`**${index + 1}.** <@${entry.userId}> — **${entry.count}** invite${entry.count === 1 ? '' : 's'}`
				).join('\n')
				: 'No invites have been tracked yet.';
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
					.setTitle('Invite rewards')
					.setDescription(rewards.length
						? rewards.map(([count, roleIds]) =>
							`**${count} invites:** ${roleIds.map(roleId => `<@&${roleId}>`).join(', ')}`
						).join('\n')
						: 'No invite role rewards have been configured yet.'),
			],
		});
	},
};
