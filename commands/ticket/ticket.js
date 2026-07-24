const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	EmbedBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
} = require('discord.js');
const {
	closeTicket,
	createPanel,
	findOpenTicket,
	getPanel,
	getPanels,
	getTicketByChannel,
	saveTicket,
} = require('../../utils/ticketStore');

const openingTickets = new Set();

const data = new SlashCommandBuilder()
	.setName('ticket')
	.setDescription('Open tickets en beheer ticketpanelen.')
	.addSubcommand(subcommand =>
		subcommand
			.setName('paneel-maken')
			.setDescription('Maak en plaats een nieuw ticketpaneel.')
			.addStringOption(option =>
				option.setName('titel').setDescription('Titel van het paneel.').setMaxLength(256).setRequired(true)
			)
			.addStringOption(option =>
				option
					.setName('beschrijving')
					.setDescription('Uitleg in het paneel; gebruik \\n voor een nieuwe regel.')
					.setMaxLength(4000)
					.setRequired(true)
			)
			.addStringOption(option =>
				option.setName('knoptekst').setDescription('Tekst op de ticketknop.').setMaxLength(80).setRequired(true)
			)
			.addChannelOption(option =>
				option
					.setName('categorie')
					.setDescription('Categorie waarin tickets worden aangemaakt.')
					.addChannelTypes(ChannelType.GuildCategory)
					.setRequired(true)
			)
			.addRoleOption(option =>
				option.setName('supportrol').setDescription('Rol die de tickets kan bekijken.').setRequired(true)
			)
			.addChannelOption(option =>
				option
					.setName('kanaal')
					.setDescription('Kanaal waarin het paneel wordt geplaatst.')
					.addChannelTypes(ChannelType.GuildText)
			)
			.addStringOption(option =>
				option.setName('kleur').setDescription('Hexkleur, bijvoorbeeld #5865F2.').setMinLength(6).setMaxLength(7)
			)
	)
	.addSubcommand(subcommand =>
		subcommand.setName('panelen').setDescription('Bekijk de ingestelde ticketpanelen.')
	)
	.addSubcommand(subcommand =>
		subcommand.setName('sluiten').setDescription('Sluit het huidige ticket.')
	);

function parseColor(input) {
	if (!input) return 0x5865f2;
	const value = input.replace(/^#/, '');
	return /^[0-9a-f]{6}$/i.test(value) ? Number.parseInt(value, 16) : null;
}

function ticketChannelName(username) {
	const safeName = username
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9-]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 70);
	return `ticket-${safeName || 'lid'}`;
}

function closeButton() {
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId('ticket:close')
			.setLabel('Ticket sluiten')
			.setEmoji('🔒')
			.setStyle(ButtonStyle.Danger)
	);
}

function canCloseTicket(interaction, ticket) {
	return interaction.user.id === ticket.userId ||
		interaction.memberPermissions.has(PermissionFlagsBits.Administrator) ||
		interaction.member.roles.cache.has(ticket.supportRoleId);
}

async function archiveTicket(interaction) {
	const ticket = getTicketByChannel(interaction.guildId, interaction.channelId);

	if (!ticket || ticket.status !== 'open') {
		await interaction.reply({ content: 'Dit kanaal is geen open ticket.', ephemeral: true });
		return;
	}

	if (!canCloseTicket(interaction, ticket)) {
		await interaction.reply({ content: 'Je mag dit ticket niet sluiten.', ephemeral: true });
		return;
	}

	await interaction.deferReply({ ephemeral: true });
	await interaction.channel.permissionOverwrites.edit(ticket.userId, { ViewChannel: false });
	await interaction.channel.setName(`gesloten-${interaction.channel.name.replace(/^ticket-/, '')}`.slice(0, 100));
	await interaction.channel.send(`🔒 Ticket gesloten door ${interaction.user}.`);
	closeTicket(interaction.guildId, interaction.channelId, interaction.user.id);
	await interaction.editReply('Het ticket is gesloten en gearchiveerd.');
}

module.exports = {
	data,
	ticketChannelName,

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === 'sluiten') {
			await archiveTicket(interaction);
			return;
		}

		if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({
				content: 'Alleen een serverbeheerder kan ticketpanelen beheren.',
				ephemeral: true,
			});
			return;
		}

		if (subcommand === 'panelen') {
			const panels = getPanels(interaction.guildId);
			const description = panels.length
				? panels.map(panel =>
					`**${panel.title}** (\`${panel.id}\`)\n` +
					`Categorie: <#${panel.categoryId}> · Support: <@&${panel.supportRoleId}>`
				).join('\n\n')
				: 'Er zijn nog geen ticketpanelen gemaakt.';
			await interaction.reply({
				embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('Ticketpanelen').setDescription(description)],
				ephemeral: true,
			});
			return;
		}

		const color = parseColor(interaction.options.getString('kleur'));

		if (color === null) {
			await interaction.reply({ content: 'Gebruik een geldige hexkleur, bijvoorbeeld `#5865F2`.', ephemeral: true });
			return;
		}

		const targetChannel = interaction.options.getChannel('kanaal') || interaction.channel;
		const panel = createPanel(interaction.guildId, {
			title: interaction.options.getString('titel'),
			description: interaction.options.getString('beschrijving').replaceAll('\\n', '\n'),
			buttonLabel: interaction.options.getString('knoptekst'),
			categoryId: interaction.options.getChannel('categorie').id,
			supportRoleId: interaction.options.getRole('supportrol').id,
			color,
			createdBy: interaction.user.id,
		});
		const button = new ButtonBuilder()
			.setCustomId(`ticket:open:${panel.id}`)
			.setLabel(panel.buttonLabel)
			.setEmoji('🎫')
			.setStyle(ButtonStyle.Primary);

		await targetChannel.send({
			embeds: [
				new EmbedBuilder()
					.setColor(panel.color)
					.setTitle(panel.title)
					.setDescription(panel.description)
					.setFooter({ text: 'Klik op de knop om een privé-ticket te openen.' }),
			],
			components: [new ActionRowBuilder().addComponents(button)],
		});
		await interaction.reply({ content: `Het ticketpaneel is geplaatst in ${targetChannel}.`, ephemeral: true });
	},

	async handleButton(interaction) {
		const [, action, panelId] = interaction.customId.split(':');

		if (action === 'close') {
			await archiveTicket(interaction);
			return;
		}

		if (action !== 'open' || !panelId) {
			await interaction.reply({ content: 'Deze ticketknop is niet meer geldig.', ephemeral: true });
			return;
		}

		const panel = getPanel(interaction.guildId, panelId);

		if (!panel) {
			await interaction.reply({ content: 'Dit ticketpaneel bestaat niet meer.', ephemeral: true });
			return;
		}

		const lockKey = `${interaction.guildId}:${panelId}:${interaction.user.id}`;

		if (openingTickets.has(lockKey)) {
			await interaction.reply({ content: 'Je ticket wordt al aangemaakt.', ephemeral: true });
			return;
		}

		openingTickets.add(lockKey);
		await interaction.deferReply({ ephemeral: true });

		try {
			const existing = findOpenTicket(interaction.guildId, panelId, interaction.user.id);

			if (existing) {
				const existingChannel = await interaction.guild.channels.fetch(existing.channelId).catch(() => null);

				if (existingChannel) {
					await interaction.editReply(`Je hebt voor dit paneel al een open ticket: ${existingChannel}`);
					return;
				}

				closeTicket(interaction.guildId, existing.channelId, interaction.client.user.id);
			}

			const category = await interaction.guild.channels.fetch(panel.categoryId).catch(() => null);
			const supportRole = await interaction.guild.roles.fetch(panel.supportRoleId).catch(() => null);

			if (!category || category.type !== ChannelType.GuildCategory || !supportRole) {
				await interaction.editReply('Dit paneel is niet meer juist ingesteld. Waarschuw een beheerder.');
				return;
			}

			const channel = await interaction.guild.channels.create({
				name: ticketChannelName(interaction.user.username),
				type: ChannelType.GuildText,
				parent: category.id,
				topic: `Ticket van ${interaction.user.tag} · paneel ${panel.id}`,
				permissionOverwrites: [
					{ id: interaction.guildId, deny: [PermissionFlagsBits.ViewChannel] },
					{
						id: interaction.user.id,
						allow: [
							PermissionFlagsBits.ViewChannel,
							PermissionFlagsBits.SendMessages,
							PermissionFlagsBits.ReadMessageHistory,
							PermissionFlagsBits.AttachFiles,
						],
					},
					{
						id: supportRole.id,
						allow: [
							PermissionFlagsBits.ViewChannel,
							PermissionFlagsBits.SendMessages,
							PermissionFlagsBits.ReadMessageHistory,
							PermissionFlagsBits.AttachFiles,
						],
					},
					{
						id: interaction.client.user.id,
						allow: [
							PermissionFlagsBits.ViewChannel,
							PermissionFlagsBits.SendMessages,
							PermissionFlagsBits.ManageChannels,
						],
					},
				],
			});

			saveTicket(interaction.guildId, {
				channelId: channel.id,
				panelId,
				userId: interaction.user.id,
				supportRoleId: supportRole.id,
				status: 'open',
				createdAt: new Date().toISOString(),
			});
			await channel.send({
				content: `${interaction.user} ${supportRole}`,
				embeds: [
					new EmbedBuilder()
						.setColor(panel.color)
						.setTitle(panel.title)
						.setDescription('Beschrijf hier zo duidelijk mogelijk waarmee we je kunnen helpen.'),
				],
				components: [closeButton()],
				allowedMentions: { users: [interaction.user.id], roles: [supportRole.id] },
			});
			await interaction.editReply(`Je ticket is aangemaakt: ${channel}`);
		} finally {
			openingTickets.delete(lockKey);
		}
	},
};
