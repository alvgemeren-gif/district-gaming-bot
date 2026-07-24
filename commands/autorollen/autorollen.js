const {
	PermissionFlagsBits,
	SlashCommandBuilder,
} = require('discord.js');
const {
	deleteAutoroleConfig,
	getAutoroleConfig,
	setAutoroleConfig,
} = require('../../utils/autoroleConfig');

const MAX_ROLES = 10;

const data = new SlashCommandBuilder()
	.setName('autorollen')
	.setDescription('Beheer rollen die nieuwe leden automatisch krijgen.')
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
	.addSubcommand(subcommand => {
		subcommand
			.setName('instellen')
			.setDescription('Stel meerdere automatische rollen in.');

		for (let index = 1; index <= MAX_ROLES; index += 1) {
			subcommand.addRoleOption(option =>
				option
					.setName(`rol${index}`)
					.setDescription(`Automatische rol ${index}.`)
					.setRequired(index === 1)
			);
		}

		return subcommand;
	})
	.addSubcommand(subcommand =>
		subcommand
			.setName('bekijken')
			.setDescription('Bekijk welke automatische rollen ingesteld zijn.')
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('uit')
			.setDescription('Zet automatische rollen uit.')
	);

module.exports = {
	data,

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === 'instellen') {
			const roles = [];

			for (let index = 1; index <= MAX_ROLES; index += 1) {
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

			setAutoroleConfig(interaction.guildId, roles.map(role => role.id));

			await interaction.reply({
				content: `Automatische rollen ingesteld: ${roles.map(role => `${role}`).join(', ')}`,
				ephemeral: true,
			});
			return;
		}

		if (subcommand === 'bekijken') {
			const config = getAutoroleConfig(interaction.guildId);

			if (!config.roleIds.length) {
				await interaction.reply({
					content: 'Er zijn nog geen automatische rollen ingesteld.',
					ephemeral: true,
				});
				return;
			}

			await interaction.reply({
				content: `Automatische rollen: ${config.roleIds.map(roleId => `<@&${roleId}>`).join(', ')}`,
				ephemeral: true,
			});
			return;
		}

		deleteAutoroleConfig(interaction.guildId);
		await interaction.reply({
			content: 'Automatische rollen uitgezet.',
			ephemeral: true,
		});
	},
};
