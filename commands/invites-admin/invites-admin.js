const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const {
	addInviteReward,
	deleteInviteReward,
	getInviteRewards,
	syncInviteRoles,
} = require('../../utils/inviteSystem');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('invites-admin')
		.setDescription('Beheer rolbeloningen voor uitnodigingen.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand(subcommand =>
			subcommand
				.setName('beloning-toevoegen')
				.setDescription('Geef een rol vanaf een bepaald aantal uitnodigingen.')
				.addIntegerOption(option =>
					option.setName('aantal').setDescription('Het benodigde aantal invites.').setMinValue(1).setMaxValue(100000).setRequired(true)
				)
				.addRoleOption(option =>
					option.setName('rol').setDescription('De rol die automatisch wordt gegeven.').setRequired(true)
				)
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('beloning-verwijderen')
				.setDescription('Verwijder een rolbeloning.')
				.addIntegerOption(option =>
					option.setName('aantal').setDescription('De invitegrens.').setMinValue(1).setMaxValue(100000).setRequired(true)
				)
				.addRoleOption(option =>
					option.setName('rol').setDescription('Leeg laten om alle rollen bij deze grens te verwijderen.')
				)
		),

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();
		const count = interaction.options.getInteger('aantal');
		const role = interaction.options.getRole('rol');

		if (subcommand === 'beloning-toevoegen') {
			const botMember = await interaction.guild.members.fetchMe();

			if (role.managed || role.id === interaction.guildId || role.position >= botMember.roles.highest.position) {
				await interaction.reply({
					content: 'Ik kan deze rol niet geven. Kies een normale rol onder mijn hoogste botrol.',
					ephemeral: true,
				});
				return;
			}

			addInviteReward(interaction.guildId, count, role.id);
			await interaction.deferReply({ ephemeral: true });
			for (const member of interaction.guild.members.cache.values()) {
				await syncInviteRoles(interaction.guild, member.id);
			}
			await interaction.editReply(`${role} wordt vanaf **${count}** actieve uitnodiging${count === 1 ? '' : 'en'} automatisch gegeven.`);
			return;
		}

		const removedRoleIds = role
			? [role.id]
			: [...(getInviteRewards(interaction.guildId)[count] || [])];
		deleteInviteReward(interaction.guildId, count, role?.id || null);
		const remainingRoleIds = new Set(Object.values(getInviteRewards(interaction.guildId)).flat());
		const obsoleteRoleIds = removedRoleIds.filter(roleId => !remainingRoleIds.has(roleId));

		await interaction.deferReply({ ephemeral: true });
		if (obsoleteRoleIds.length) {
			for (const member of interaction.guild.members.cache.values()) {
				const assignedRoleIds = obsoleteRoleIds.filter(roleId => member.roles.cache.has(roleId));
				if (assignedRoleIds.length) {
					await member.roles.remove(assignedRoleIds).catch(console.error);
				}
			}
		}
		await interaction.editReply({
			content: role
				? `${role} is verwijderd als beloning bij **${count}** invites.`
				: `Alle beloningen bij **${count}** invites zijn verwijderd.`,
		});
	},
};
