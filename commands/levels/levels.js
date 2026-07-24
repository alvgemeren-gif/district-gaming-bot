const {
	ChannelType,
	PermissionFlagsBits,
	SlashCommandBuilder,
} = require('discord.js');
const {
	deleteLevelAnnouncementChannel,
	deleteLevelReward,
	getLevelRewards,
	getLevelSettings,
	getUserLevel,
	setLevelAnnouncementChannel,
	setLevelReward,
} = require('../../utils/levelSystem');

const MAX_REWARD_ROLES = 10;

const data = new SlashCommandBuilder()
	.setName('levels')
	.setDescription('Beheer levels en level beloningsrollen.')
	.addSubcommand(subcommand =>
		subcommand
			.setName('rank')
			.setDescription('Bekijk je level.')
			.addUserOption(option =>
				option
					.setName('gebruiker')
					.setDescription('Gebruiker om te bekijken.')
					.setRequired(false)
			)
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('beloningen')
			.setDescription('Bekijk alle level beloningen.')
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('meldingen-kanaal')
			.setDescription('Stel in waar level-up meldingen geplaatst worden.')
			.addChannelOption(option =>
				option
					.setName('kanaal')
					.setDescription('Kanaal voor level-up meldingen.')
					.addChannelTypes(ChannelType.GuildText)
					.setRequired(true)
			)
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('meldingen-uit')
			.setDescription('Gebruik weer het kanaal waar iemand levelt voor level-up meldingen.')
	)
	.addSubcommand(subcommand => {
		subcommand
			.setName('beloning-toevoegen')
			.setDescription('Voeg meerdere beloningsrollen toe aan een level.')
			.addIntegerOption(option =>
				option
					.setName('level')
					.setDescription('Level waarvoor deze rollen worden gegeven.')
					.setMinValue(1)
					.setRequired(true)
			);

		for (let index = 1; index <= MAX_REWARD_ROLES; index += 1) {
			subcommand.addRoleOption(option =>
				option
					.setName(`rol${index}`)
					.setDescription(`Beloningsrol ${index}.`)
					.setRequired(index === 1)
			);
		}

		return subcommand;
	})
	.addSubcommand(subcommand =>
		subcommand
			.setName('beloning-verwijderen')
			.setDescription('Verwijder alle beloningsrollen van een level.')
			.addIntegerOption(option =>
				option
					.setName('level')
					.setDescription('Level waarvan de beloning weg moet.')
					.setMinValue(1)
					.setRequired(true)
			)
	);

module.exports = {
	data,

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === 'rank') {
			const user = interaction.options.getUser('gebruiker') || interaction.user;
			const rank = getUserLevel(interaction.guildId, user.id);

			await interaction.reply({
				content: `${user} is level ${rank.level} met ${rank.xp}/${rank.nextLevelXp} XP.`,
				ephemeral: true,
			});
			return;
		}

		if (subcommand === 'beloningen') {
			const rewards = getLevelRewards(interaction.guildId);
			const settings = getLevelSettings(interaction.guildId);
			const entries = Object.entries(rewards)
				.sort(([levelA], [levelB]) => Number(levelA) - Number(levelB));
			const channelLine = settings.announcementChannelId
				? `Level-up kanaal: <#${settings.announcementChannelId}>`
				: 'Level-up kanaal: huidig berichtkanaal';

			if (!entries.length) {
				await interaction.reply({
					content: `${channelLine}\nEr zijn nog geen level beloningen ingesteld.`,
				});
				return;
			}

			await interaction.reply({
				content: `${channelLine}\n` + entries
					.map(([level, roleIds]) => `Level ${level}: ${roleIds.map(roleId => `<@&${roleId}>`).join(', ')}`)
					.join('\n'),
			});
			return;
		}

		if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) {
			await interaction.reply({
				content: 'Je hebt Manage Roles nodig om level beloningen te beheren.',
				ephemeral: true,
			});
			return;
		}

		if (subcommand === 'meldingen-kanaal') {
			const channel = interaction.options.getChannel('kanaal');
			setLevelAnnouncementChannel(interaction.guildId, channel.id);

			await interaction.reply({
				content: `Level-up meldingen worden nu geplaatst in ${channel}.`,
				ephemeral: true,
			});
			return;
		}

		if (subcommand === 'meldingen-uit') {
			deleteLevelAnnouncementChannel(interaction.guildId);

			await interaction.reply({
				content: 'Level-up meldingen worden nu weer geplaatst in het kanaal waar iemand levelt.',
				ephemeral: true,
			});
			return;
		}

		const level = interaction.options.getInteger('level');

		if (subcommand === 'beloning-toevoegen') {
			const roles = [];

			for (let index = 1; index <= MAX_REWARD_ROLES; index += 1) {
				const role = interaction.options.getRole(`rol${index}`);

				if (role && !roles.some(existingRole => existingRole.id === role.id)) {
					roles.push(role);
				}
			}

			const botMember = await interaction.guild.members.fetchMe();
			const invalidRole = roles.find(role => role.position >= botMember.roles.highest.position);

			if (invalidRole) {
				await interaction.reply({
					content: `Ik kan ${invalidRole} niet beheren. Zet mijn hoogste rol boven deze rol in de serverinstellingen.`,
					ephemeral: true,
				});
				return;
			}

			setLevelReward(interaction.guildId, level, roles.map(role => role.id));

			await interaction.reply({
				content: `Beloning voor level ${level} ingesteld: ${roles.map(role => `${role}`).join(', ')}`,
				ephemeral: true,
			});
			return;
		}

		deleteLevelReward(interaction.guildId, level);
		await interaction.reply({
			content: `Beloning voor level ${level} verwijderd.`,
			ephemeral: true,
		});
	},
};
