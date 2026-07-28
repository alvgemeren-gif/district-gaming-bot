const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	EmbedBuilder,
	PermissionFlagsBits,
	RoleSelectMenuBuilder,
	SlashCommandBuilder,
} = require('discord.js');
const {
	createRolePanel, getRolePanel, setRolePanelMessage,
} = require('../../utils/rolePanelStore');

const pendingPanels = new Map();

function parseColor(value) {
	const hex = value.trim().replace(/^#/, '').replace(/^0x/i, '');
	return /^[0-9a-f]{6}$/i.test(hex) ? Number.parseInt(hex, 16) : null;
}

function panelComponents(panelId, roles) {
	const buttons = roles.map(role => new ButtonBuilder()
		.setCustomId(`create:role:${panelId}:${role.id}`)
		.setLabel(role.name.slice(0, 80))
		.setStyle(ButtonStyle.Secondary));
	const rows = [];
	for (let index = 0; index < buttons.length; index += 5) {
		rows.push(new ActionRowBuilder().addComponents(buttons.slice(index, index + 5)));
	}
	return rows;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('create')
		.setDescription('Maak configureerbare serveronderdelen.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand(command => command
			.setName('roles')
			.setDescription('Maak een nieuw rollenpaneel.')
			.addStringOption(option => option.setName('titel')
				.setDescription('Titel van het rollenpaneel.').setMaxLength(256).setRequired(true))
			.addStringOption(option => option.setName('kleur')
				.setDescription('Hexkleur, bijvoorbeeld #5865F2.').setMinLength(6).setMaxLength(8).setRequired(true))
			.addStringOption(option => option.setName('beschrijving')
				.setDescription('Optionele uitleg; gebruik \\\\n voor een nieuwe regel.').setMaxLength(3800))
			.addChannelOption(option => option.setName('kanaal')
				.setDescription('Kanaal voor het panel; standaard het huidige kanaal.')
				.addChannelTypes(ChannelType.GuildText))),

	async execute(interaction) {
		if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)
			|| !interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) {
			await interaction.reply({
				content: 'Je hebt Administrator en Rollen beheren nodig om een rollenpaneel te maken.',
				ephemeral: true,
			});
			return;
		}
		const color = parseColor(interaction.options.getString('kleur', true));
		if (color === null) {
			await interaction.reply({ content: 'Gebruik een geldige hexkleur, bijvoorbeeld `#5865F2`.', ephemeral: true });
			return;
		}

		const nonce = `${Date.now().toString(36)}-${interaction.user.id}`;
		pendingPanels.set(nonce, {
			guildId: interaction.guildId,
			userId: interaction.user.id,
			channelId: (interaction.options.getChannel('kanaal') || interaction.channel).id,
			title: interaction.options.getString('titel', true),
			description: interaction.options.getString('beschrijving')?.replaceAll('\\n', '\n') || null,
			color,
		});
		setTimeout(() => pendingPanels.delete(nonce), 15 * 60 * 1000);
		await interaction.reply({
			content: 'Selecteer nu de rollen die op dit panel moeten staan (maximaal 25):',
			components: [new ActionRowBuilder().addComponents(
				new RoleSelectMenuBuilder()
					.setCustomId(`create:roles-select:${nonce}`)
					.setPlaceholder('Kies 1 tot 25 rollen')
					.setMinValues(1)
					.setMaxValues(25)
			)],
			ephemeral: true,
		});
	},

	async handleSelectMenu(interaction) {
		const [, action, nonce] = interaction.customId.split(':');
		if (action !== 'roles-select') return;
		const pending = pendingPanels.get(nonce);
		if (!pending || pending.guildId !== interaction.guildId || pending.userId !== interaction.user.id) {
			await interaction.reply({ content: 'Deze configuratie is verlopen. Gebruik `/create roles` opnieuw.', ephemeral: true });
			return;
		}

		const roles = interaction.values.map(id => interaction.guild.roles.cache.get(id)).filter(Boolean);
		const botMember = await interaction.guild.members.fetchMe();
		const invalid = roles.find(role =>
			role.managed || role.id === interaction.guildId || role.position >= botMember.roles.highest.position
		);
		if (invalid) {
			await interaction.reply({
				content: `Ik kan ${invalid} niet beheren. Kies alleen normale rollen onder mijn hoogste botrol.`,
				ephemeral: true,
			});
			return;
		}

		await interaction.deferUpdate();
		const panel = await createRolePanel({ ...pending, roleIds: roles.map(role => role.id), createdBy: interaction.user.id });
		const channel = await interaction.guild.channels.fetch(pending.channelId);
		const embed = new EmbedBuilder()
			.setColor(pending.color)
			.setTitle(pending.title)
			.setDescription(
				`${pending.description ? `${pending.description}\n\n` : ''}` +
				'Klik op een rol om deze toe te voegen. Klik nogmaals om hem te verwijderen.'
			);
		const message = await channel.send({ embeds: [embed], components: panelComponents(panel.id, roles) });
		await setRolePanelMessage(panel.id, message.id);
		pendingPanels.delete(nonce);
		await interaction.editReply({
			content: `Rollenpaneel geplaatst in ${channel} met ${roles.length} rol${roles.length === 1 ? '' : 'len'}.`,
			components: [],
		});
	},

	async handleButton(interaction) {
		const [, action, panelId, roleId] = interaction.customId.split(':');
		if (action !== 'role' || !/^[0-9]+$/.test(panelId)) return;
		await interaction.deferReply({ ephemeral: true });
		const panel = await getRolePanel(panelId, interaction.guildId);
		if (!panel || !panel.role_ids.includes(roleId)) {
			await interaction.editReply('Deze rol is niet meer beschikbaar op dit panel.');
			return;
		}
		const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
		const member = await interaction.guild.members.fetch(interaction.user.id);
		if (!role) {
			await interaction.editReply('Deze rol bestaat niet meer.');
			return;
		}
		if (member.roles.cache.has(roleId)) {
			await member.roles.remove(role, `Rollenpaneel #${panelId}`);
			await interaction.editReply(`${role} is verwijderd.`);
		} else {
			await member.roles.add(role, `Rollenpaneel #${panelId}`);
			await interaction.editReply(`${role} is toegevoegd.`);
		}
	},

	parseColor,
};
