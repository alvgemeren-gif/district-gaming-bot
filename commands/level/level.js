const {
	EmbedBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
} = require('discord.js');
const {
	addLevelReward,
	deleteLevelAnnouncementChannel,
	deleteLevelReward,
	getLevelLeaderboard,
	getLevelRewards,
	getLevelSettings,
	getUserLevel,
	setLevelAnnouncementChannel,
} = require('../../utils/levelSystem');

const data = new SlashCommandBuilder()
	.setName('level')
	.setDescription('View levels and manage role rewards.')
	.addSubcommand(subcommand =>
		subcommand
			.setName('rank')
			.setDescription('View your level or another member’s level.')
			.addUserOption(option =>
				option.setName('member').setDescription('The member whose level you want to view.')
			)
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('leaderboard')
			.setDescription('View the members with the most XP.')
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('rewards')
			.setDescription('View all configured role rewards.')
	);

function isAdministrator(interaction) {
	return interaction.memberPermissions.has(PermissionFlagsBits.Administrator);
}

function progressBar(current, maximum, size = 10) {
	const ratio = maximum > 0 ? Math.min(Math.max(current / maximum, 0), 1) : 1;
	const filled = Math.round(ratio * size);
	return `${'▰'.repeat(filled)}${'▱'.repeat(size - filled)}`;
}

async function requireAdministrator(interaction) {
	if (isAdministrator(interaction)) {
		return true;
	}

	await interaction.reply({
		content: 'Only a server administrator can change level settings.',
		ephemeral: true,
	});
	return false;
}

module.exports = {
	data,

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === 'rank') {
			const user = interaction.options.getUser('member') || interaction.user;
			const rank = await getUserLevel(interaction.guildId, user.id);
			const earnedThisLevel = rank.xp - rank.currentLevelXp;
			const neededThisLevel = rank.nextLevelXp - rank.currentLevelXp;
			const embed = new EmbedBuilder()
				.setColor(0x5865f2)
				.setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
				.setTitle(`Level ${rank.level}`)
				.setDescription(
					`${progressBar(earnedThisLevel, neededThisLevel)}\n` +
					`**${rank.xp} XP** · **${rank.nextLevelXp - rank.xp} XP** remaining until level ${rank.level + 1}`
				);

			await interaction.reply({ embeds: [embed] });
			return;
		}

		if (subcommand === 'leaderboard') {
			const leaderboard = await getLevelLeaderboard(interaction.guildId, 10);
			const description = leaderboard.length
				? leaderboard.map((entry, index) =>
					`**${index + 1}.** <@${entry.userId}> — level **${entry.level}** · ${entry.xp} XP`
				).join('\n')
				: 'No XP has been earned yet.';

			await interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xf1c40f)
						.setTitle('Level leaderboard')
						.setDescription(description),
				],
			});
			return;
		}

		if (subcommand === 'rewards') {
			const rewards = await getLevelRewards(interaction.guildId);
			const entries = Object.entries(rewards)
				.filter(([, roleIds]) => roleIds.length)
				.sort(([levelA], [levelB]) => Number(levelA) - Number(levelB));
			const settings = await getLevelSettings(interaction.guildId);
			const description = entries.length
				? entries.map(([level, roleIds]) =>
					`**Level ${level}:** ${roleIds.map(roleId => `<@&${roleId}>`).join(', ')}`
				).join('\n')
				: 'No role rewards have been configured yet.';

			await interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setTitle('Level rewards')
						.setDescription(description)
						.setFooter({
							text: settings.announcementChannelId
								? `Level-up announcements: #${interaction.guild.channels.cache.get(settings.announcementChannelId)?.name || 'deleted-channel'}`
								: 'Level-up announcements are posted in the active channel.',
						}),
				],
				ephemeral: true,
			});
			return;
		}

		if (!await requireAdministrator(interaction)) {
			return;
		}

		if (subcommand === 'channel') {
			const channel = interaction.options.getChannel('channel');

			if (channel) {
				await setLevelAnnouncementChannel(interaction.guildId, channel.id);
			} else {
				await deleteLevelAnnouncementChannel(interaction.guildId);
			}

			await interaction.reply({
				content: channel
					? `Level-up announcements will now be posted in ${channel}.`
					: 'Level-up announcements will now be posted in the channel where XP is earned.',
				ephemeral: true,
			});
			return;
		}

		const level = interaction.options.getInteger('level');
		const role = interaction.options.getRole('role');

		if (subcommand === 'reward-add') {
			const botMember = await interaction.guild.members.fetchMe();

			if (role.managed || role.id === interaction.guildId || role.position >= botMember.roles.highest.position) {
				await interaction.reply({
					content: 'I cannot award this role. Choose a regular role below my highest bot role.',
					ephemeral: true,
				});
				return;
			}

			await addLevelReward(interaction.guildId, level, role.id);
			await interaction.reply({
				content: `${role} will now be awarded automatically at level **${level}**.`,
				ephemeral: true,
			});
			return;
		}

		await deleteLevelReward(interaction.guildId, level, role?.id || null);
		await interaction.reply({
			content: role
				? `${role} has been removed as a reward for level **${level}**.`
				: `All role rewards for level **${level}** have been removed.`,
			ephemeral: true,
		});
	},
};
