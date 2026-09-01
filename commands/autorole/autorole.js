const {
	ActionRowBuilder,
	PermissionFlagsBits,
	RoleSelectMenuBuilder,
	SlashCommandBuilder,
} = require('discord.js');
const {
	deleteAutoroleConfig,
	getAutoroleConfig,
	setAutoroleConfig,
} = require('../../utils/autoroleConfig');

const COMMAND_NAME = 'autorole';

const data = new SlashCommandBuilder()
	.setName(COMMAND_NAME)
	.setDescription('Geef nieuwe leden automatisch meerdere rollen.')
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.addSubcommand(command => command
		.setName('instellen')
		.setDescription('Selecteer alle rollen die nieuwe leden automatisch krijgen.'))
	.addSubcommand(command => command
		.setName('status')
		.setDescription('Bekijk de ingestelde automatische rollen.'))
	.addSubcommand(command => command
		.setName('uitschakelen')
		.setDescription('Verwijder alle ingestelde automatische rollen.'));

module.exports = {
	data,

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();
		if (subcommand === 'status') {
			const { roleIds } = getAutoroleConfig(interaction.guildId);
			await interaction.reply({
				content: roleIds.length
					? `Nieuwe leden krijgen automatisch: ${roleIds.map(id => `<@&${id}>`).join(', ')}`
					: 'Er zijn geen automatische rollen ingesteld.',
				ephemeral: true,
			});
			return;
		}

		if (subcommand === 'uitschakelen') {
			deleteAutoroleConfig(interaction.guildId);
			await interaction.reply({ content: 'Automatische rollen zijn uitgeschakeld.', ephemeral: true });
			return;
		}

		await interaction.reply({
			content: 'Selecteer alle rollen die ieder nieuw lid automatisch moet krijgen:',
			components: [new ActionRowBuilder().addComponents(
				new RoleSelectMenuBuilder()
					.setCustomId(`${COMMAND_NAME}:instellen:${interaction.user.id}`)
					.setPlaceholder('Kies maximaal 25 automatische rollen')
					.setMinValues(1)
					.setMaxValues(25)
			)],
			ephemeral: true,
		});
	},

	async handleSelectMenu(interaction) {
		const [command, action, userId] = interaction.customId.split(':');
		if (command !== COMMAND_NAME || action !== 'instellen') return;
		if (interaction.user.id !== userId) {
			await interaction.reply({ content: 'Alleen de beheerder die dit menu opende kan het gebruiken.', ephemeral: true });
			return;
		}

		const botMember = await interaction.guild.members.fetchMe();
		const roles = interaction.values
			.map(id => interaction.guild.roles.cache.get(id))
			.filter(Boolean);
		if (roles.length !== interaction.values.length) {
			await interaction.reply({ content: 'Een geselecteerde rol bestaat niet meer.', ephemeral: true });
			return;
		}
		const invalid = roles.find(role =>
			role.managed
			|| role.id === interaction.guildId
			|| role.position >= botMember.roles.highest.position
		);
		if (invalid) {
			await interaction.reply({
				content: `Ik kan ${invalid} niet uitdelen. Zet mijn botrol boven deze rol en probeer opnieuw.`,
				ephemeral: true,
			});
			return;
		}

		setAutoroleConfig(interaction.guildId, roles.map(role => role.id));
		await interaction.update({
			content: `${roles.length} automatische rol${roles.length === 1 ? '' : 'len'} ingesteld: ${roles.join(', ')}`,
			components: [],
		});
	},
};
