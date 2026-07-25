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
const closingTickets = new Set();

const data = new SlashCommandBuilder()
	.setName('ticket')
	.setDescription('Open tickets and manage ticket panels.')
	.addSubcommand(subcommand =>
		subcommand.setName('close').setDescription('Close the current ticket.')
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
	return `ticket-${safeName || 'member'}`;
}

function closeButton() {
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId('ticket:close')
			.setLabel('Close ticket')
			.setEmoji('🔒')
			.setStyle(ButtonStyle.Danger)
	);
}

function canCloseTicket(interaction, ticket) {
	return interaction.user.id === ticket.userId ||
		interaction.memberPermissions.has(PermissionFlagsBits.Administrator) ||
		interaction.member.roles.cache.has(ticket.supportRoleId);
}

async function deleteTicket(interaction) {
	const ticket = getTicketByChannel(interaction.guildId, interaction.channelId);

	if (!ticket || ticket.status !== 'open') {
		await interaction.reply({ content: 'This channel is not an open ticket.', ephemeral: true });
		return;
	}

	if (!canCloseTicket(interaction, ticket)) {
		await interaction.reply({ content: 'You are not allowed to close this ticket.', ephemeral: true });
		return;
	}

	const lockKey = `${interaction.guildId}:${interaction.channelId}`;
	if (closingTickets.has(lockKey)) {
		await interaction.reply({ content: 'This ticket is already being closed.', ephemeral: true });
		return;
	}

	closingTickets.add(lockKey);
	await interaction.deferReply({ ephemeral: true });
	try {
		const channelId = interaction.channelId;
		await interaction.channel.delete(`Ticket closed by ${interaction.user.tag} (${interaction.user.id})`);
		closeTicket(interaction.guildId, channelId, interaction.user.id);
		await interaction.editReply('The ticket has been closed and its channel was deleted.').catch(() => {});
	} finally {
		closingTickets.delete(lockKey);
	}
}

module.exports = {
	data,
	ticketChannelName,

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === 'close') {
			await deleteTicket(interaction);
			return;
		}

		if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({
				content: 'Only a server administrator can manage ticket panels.',
				ephemeral: true,
			});
			return;
		}

		if (subcommand === 'panels') {
			const panels = getPanels(interaction.guildId);
			const description = panels.length
				? panels.map(panel =>
					`**${panel.title}** (\`${panel.id}\`)\n` +
					`Category: <#${panel.categoryId}> · Support: <@&${panel.supportRoleId}>`
				).join('\n\n')
				: 'No ticket panels have been created yet.';
			await interaction.reply({
				embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('Ticket panels').setDescription(description)],
				ephemeral: true,
			});
			return;
		}

		const color = parseColor(interaction.options.getString('color'));

		if (color === null) {
			await interaction.reply({ content: 'Use a valid hex color, for example `#5865F2`.', ephemeral: true });
			return;
		}

		const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
		const panel = createPanel(interaction.guildId, {
			title: interaction.options.getString('title'),
			description: interaction.options.getString('description').replaceAll('\\n', '\n'),
			buttonLabel: interaction.options.getString('button-label'),
			categoryId: interaction.options.getChannel('category').id,
			supportRoleId: interaction.options.getRole('support-role').id,
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
					.setFooter({ text: 'Click the button to open a private ticket.' }),
			],
			components: [new ActionRowBuilder().addComponents(button)],
		});
		await interaction.reply({ content: `The ticket panel has been posted in ${targetChannel}.`, ephemeral: true });
	},

	async handleButton(interaction) {
		const [, action, panelId] = interaction.customId.split(':');

		if (action === 'close') {
			await deleteTicket(interaction);
			return;
		}

		if (action !== 'open' || !panelId) {
			await interaction.reply({ content: 'This ticket button is no longer valid.', ephemeral: true });
			return;
		}

		const panel = getPanel(interaction.guildId, panelId);

		if (!panel) {
			await interaction.reply({ content: 'This ticket panel no longer exists.', ephemeral: true });
			return;
		}

		const lockKey = `${interaction.guildId}:${panelId}:${interaction.user.id}`;

		if (openingTickets.has(lockKey)) {
			await interaction.reply({ content: 'Your ticket is already being created.', ephemeral: true });
			return;
		}

		openingTickets.add(lockKey);
		await interaction.deferReply({ ephemeral: true });

		try {
			const existing = findOpenTicket(interaction.guildId, panelId, interaction.user.id);

			if (existing) {
				const existingChannel = await interaction.guild.channels.fetch(existing.channelId).catch(() => null);

				if (existingChannel) {
					await interaction.editReply(`You already have an open ticket for this panel: ${existingChannel}`);
					return;
				}

				closeTicket(interaction.guildId, existing.channelId, interaction.client.user.id);
			}

			const category = await interaction.guild.channels.fetch(panel.categoryId).catch(() => null);
			const supportRole = await interaction.guild.roles.fetch(panel.supportRoleId).catch(() => null);

			if (!category || category.type !== ChannelType.GuildCategory || !supportRole) {
				await interaction.editReply('This panel is no longer configured correctly. Contact an administrator.');
				return;
			}

			const channel = await interaction.guild.channels.create({
				name: ticketChannelName(interaction.user.username),
				type: ChannelType.GuildText,
				parent: category.id,
				topic: `Ticket opened by ${interaction.user.tag} · panel ${panel.id}`,
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
						.setDescription('Describe as clearly as possible how we can help you.'),
				],
				components: [closeButton()],
				allowedMentions: { users: [interaction.user.id], roles: [supportRole.id] },
			});
			await interaction.editReply(`Your ticket has been created: ${channel}`);
		} finally {
			openingTickets.delete(lockKey);
		}
	},
};
