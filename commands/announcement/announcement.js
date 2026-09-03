const {
	ActionRowBuilder,
	ChannelType,
	EmbedBuilder,
	ModalBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
	TextInputBuilder,
	TextInputStyle,
} = require('discord.js');

function parseColor(input) {
	const hex = input.trim().replace(/^#/, '').replace(/^0x/i, '');
	return /^[0-9a-f]{6}$/i.test(hex) ? Number.parseInt(hex, 16) : null;
}

function isHttpUrl(value) {
	try {
		const url = new URL(value);
		return url.protocol === 'https:' || url.protocol === 'http:';
	} catch {
		return false;
	}
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('announcement')
		.setDescription('Create an announcement and ping a selected role.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand(subcommand =>
			subcommand
				.setName('create')
				.setDescription('Open the announcement editor.')
				.addChannelOption(option =>
					option
						.setName('channel')
						.setDescription('Channel where the announcement will be posted.')
						.addChannelTypes(ChannelType.GuildText)
						.setRequired(true)
				)
				.addRoleOption(option =>
					option
						.setName('role')
						.setDescription('Role that will be pinged.')
						.setRequired(true)
				)
		),

	async execute(interaction) {
		if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({
				content: 'Only a server administrator can create announcements.',
				ephemeral: true,
			});
			return;
		}

		const channel = interaction.options.getChannel('channel');
		const role = interaction.options.getRole('role');

		if (role.id === interaction.guildId) {
			await interaction.reply({
				content: 'Choose a specific role instead of `@everyone`.',
				ephemeral: true,
			});
			return;
		}

		const modal = new ModalBuilder()
			.setCustomId(`announcement:create:${channel.id}:${role.id}`)
			.setTitle('Create announcement');
		const title = new TextInputBuilder()
			.setCustomId('title')
			.setLabel('Title')
			.setStyle(TextInputStyle.Short)
			.setMaxLength(256)
			.setRequired(true);
		const message = new TextInputBuilder()
			.setCustomId('message')
			.setLabel('Announcement')
			.setPlaceholder('Use Enter or Shift+Enter for new lines.')
			.setStyle(TextInputStyle.Paragraph)
			.setMaxLength(4000)
			.setRequired(true);
		const color = new TextInputBuilder()
			.setCustomId('color')
			.setLabel('Hex color')
			.setPlaceholder('#F1C40F')
			.setStyle(TextInputStyle.Short)
			.setMinLength(6)
			.setMaxLength(8)
			.setRequired(true);
		const footer = new TextInputBuilder()
			.setCustomId('footer')
			.setLabel('Footer (optional)')
			.setStyle(TextInputStyle.Short)
			.setMaxLength(2048)
			.setRequired(false);
		const image = new TextInputBuilder()
			.setCustomId('image')
			.setLabel('Image URL (optional)')
			.setPlaceholder('https://example.com/image.png')
			.setStyle(TextInputStyle.Short)
			.setRequired(false);

		modal.addComponents(
			new ActionRowBuilder().addComponents(title),
			new ActionRowBuilder().addComponents(message),
			new ActionRowBuilder().addComponents(color),
			new ActionRowBuilder().addComponents(footer),
			new ActionRowBuilder().addComponents(image)
		);
		await interaction.showModal(modal);
	},

	async handleModalSubmit(interaction) {
		if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({
				content: 'Only a server administrator can use this form.',
				ephemeral: true,
			});
			return;
		}

		const [, action, channelId, roleId] = interaction.customId.split(':');
		if (action !== 'create') return;

		const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
		const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
		if (!channel?.isTextBased() || !role || role.id === interaction.guildId) {
			await interaction.reply({
				content: 'The selected channel or role no longer exists.',
				ephemeral: true,
			});
			return;
		}

		const color = parseColor(interaction.fields.getTextInputValue('color'));
		const image = interaction.fields.getTextInputValue('image').trim();
		if (color === null) {
			await interaction.reply({ content: 'Use a valid hex color, for example `#F1C40F`.', ephemeral: true });
			return;
		}
		if (image && !isHttpUrl(image)) {
			await interaction.reply({ content: 'Use a complete `https://` link for the image.', ephemeral: true });
			return;
		}

		const footer = interaction.fields.getTextInputValue('footer').trim();
		const embed = new EmbedBuilder()
			.setColor(color)
			.setTitle(interaction.fields.getTextInputValue('title'))
			.setDescription(interaction.fields.getTextInputValue('message'))
			.setTimestamp();
		if (footer) embed.setFooter({ text: footer });
		if (image) embed.setImage(image);

		await channel.send({
			content: `<@&${role.id}>`,
			embeds: [embed],
			allowedMentions: { parse: [], roles: [role.id] },
		});
		await interaction.reply({
			content: `Announcement posted in ${channel} and ${role} was pinged.`,
			ephemeral: true,
		});
	},

	parseColor,
};
