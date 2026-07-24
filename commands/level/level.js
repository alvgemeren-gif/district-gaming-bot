const {
	ChannelType,
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
	.setDescription('Bekijk levels en beheer rolbeloningen.')
	.addSubcommand(subcommand =>
		subcommand
			.setName('rank')
			.setDescription('Bekijk het level van jezelf of een ander lid.')
			.addUserOption(option =>
				option.setName('lid').setDescription('Het lid waarvan je het level wilt bekijken.')
			)
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('leaderboard')
			.setDescription('Bekijk de leden met de meeste XP.')
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('beloning-toevoegen')
			.setDescription('Koppel een rolbeloning aan een level.')
			.addIntegerOption(option =>
				option.setName('level').setDescription('Het vereiste level.').setMinValue(1).setMaxValue(1000).setRequired(true)
			)
			.addRoleOption(option =>
				option.setName('rol').setDescription('De rol die wordt uitgereikt.').setRequired(true)
			)
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('beloning-verwijderen')
			.setDescription('Verwijder een rolbeloning van een level.')
			.addIntegerOption(option =>
				option.setName('level').setDescription('Het level van de beloning.').setMinValue(1).setMaxValue(1000).setRequired(true)
			)
			.addRoleOption(option =>
				option.setName('rol').setDescription('Laat leeg om alle beloningen van dit level te verwijderen.')
			)
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('beloningen')
			.setDescription('Bekijk alle ingestelde rolbeloningen.')
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('kanaal')
			.setDescription('Stel het kanaal voor level-upmeldingen in.')
			.addChannelOption(option =>
				option
					.setName('kanaal')
					.setDescription('Laat leeg om meldingen in het actieve kanaal te plaatsen.')
					.addChannelTypes(ChannelType.GuildText)
			)
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
		content: 'Alleen een serverbeheerder kan de levelinstellingen aanpassen.',
		ephemeral: true,
	});
	return false;
}

module.exports = {
	data,

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === 'rank') {
			const user = interaction.options.getUser('lid') || interaction.user;
			const rank = getUserLevel(interaction.guildId, user.id);
			const earnedThisLevel = rank.xp - rank.currentLevelXp;
			const neededThisLevel = rank.nextLevelXp - rank.currentLevelXp;
			const embed = new EmbedBuilder()
				.setColor(0x5865f2)
				.setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
				.setTitle(`Level ${rank.level}`)
				.setDescription(
					`${progressBar(earnedThisLevel, neededThisLevel)}\n` +
					`**${rank.xp} XP** · nog **${rank.nextLevelXp - rank.xp} XP** tot level ${rank.level + 1}`
				);

			await interaction.reply({ embeds: [embed] });
			return;
		}

		if (subcommand === 'leaderboard') {
			const leaderboard = getLevelLeaderboard(interaction.guildId, 10);
			const description = leaderboard.length
				? leaderboard.map((entry, index) =>
					`**${index + 1}.** <@${entry.userId}> — level **${entry.level}** · ${entry.xp} XP`
				).join('\n')
				: 'Er is nog geen XP verdiend.';

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

		if (subcommand === 'beloningen') {
			const rewards = getLevelRewards(interaction.guildId);
			const entries = Object.entries(rewards)
				.filter(([, roleIds]) => roleIds.length)
				.sort(([levelA], [levelB]) => Number(levelA) - Number(levelB));
			const settings = getLevelSettings(interaction.guildId);
			const description = entries.length
				? entries.map(([level, roleIds]) =>
					`**Level ${level}:** ${roleIds.map(roleId => `<@&${roleId}>`).join(', ')}`
				).join('\n')
				: 'Er zijn nog geen rolbeloningen ingesteld.';

			await interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setTitle('Levelbeloningen')
						.setDescription(description)
						.setFooter({
							text: settings.announcementChannelId
								? `Level-upmeldingen: #${interaction.guild.channels.cache.get(settings.announcementChannelId)?.name || 'verwijderd-kanaal'}`
								: 'Level-upmeldingen worden in het actieve kanaal geplaatst.',
						}),
				],
				ephemeral: true,
			});
			return;
		}

		if (!await requireAdministrator(interaction)) {
			return;
		}

		if (subcommand === 'kanaal') {
			const channel = interaction.options.getChannel('kanaal');

			if (channel) {
				setLevelAnnouncementChannel(interaction.guildId, channel.id);
			} else {
				deleteLevelAnnouncementChannel(interaction.guildId);
			}

			await interaction.reply({
				content: channel
					? `Level-upmeldingen worden voortaan in ${channel} geplaatst.`
					: 'Level-upmeldingen worden voortaan geplaatst in het kanaal waarin XP wordt verdiend.',
				ephemeral: true,
			});
			return;
		}

		const level = interaction.options.getInteger('level');
		const role = interaction.options.getRole('rol');

		if (subcommand === 'beloning-toevoegen') {
			const botMember = await interaction.guild.members.fetchMe();

			if (role.managed || role.id === interaction.guildId || role.position >= botMember.roles.highest.position) {
				await interaction.reply({
					content: 'Ik kan deze rol niet uitdelen. Kies een gewone rol die onder mijn hoogste botrol staat.',
					ephemeral: true,
				});
				return;
			}

			addLevelReward(interaction.guildId, level, role.id);
			await interaction.reply({
				content: `${role} wordt nu automatisch uitgereikt bij level **${level}**.`,
				ephemeral: true,
			});
			return;
		}

		deleteLevelReward(interaction.guildId, level, role?.id || null);
		await interaction.reply({
			content: role
				? `${role} is verwijderd als beloning voor level **${level}**.`
				: `Alle rolbeloningen voor level **${level}** zijn verwijderd.`,
			ephemeral: true,
		});
	},
};
