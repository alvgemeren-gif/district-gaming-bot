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

	if (!/^[0-9a-f]{6}$/i.test(hex)) {
		return null;
	}

	return Number.parseInt(hex, 16);
}

function withNewLines(text) {
	return text.replaceAll('\\n', '\n');
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
		.setName('embed')
		.setDescription('Create or edit an embed.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand(subcommand =>
			subcommand
				.setName('create')
				.setDescription('Create a new embed.')
				.addStringOption(option =>
					option.setName('title').setDescription('Title of the embed.').setMaxLength(256).setRequired(true)
				)
				.addStringOption(option =>
					option
						.setName('description')
						.setDescription('Embed text. Use \\n for a new line.')
						.setMaxLength(4000)
						.setRequired(true)
				)
				.addStringOption(option =>
					option
						.setName('color')
						.setDescription('Hex color, for example #5865F2.')
						.setMinLength(6)
						.setMaxLength(8)
						.setRequired(true)
				)
				.addChannelOption(option =>
					option.setName('channel').setDescription('Channel for the embed.').addChannelTypes(ChannelType.GuildText)
				)
				.addStringOption(option =>
					option.setName('footer').setDescription('Optional text at the bottom.').setMaxLength(2048)
				)
				.addStringOption(option =>
					option.setName('image').setDescription('Optional URL for a large image.')
				)
				.addStringOption(option =>
					option.setName('thumbnail').setDescription('Optional URL for a small image.')
				)
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('edit')
				.setDescription('Edit an existing embed from this bot.')
				.addStringOption(option =>
					option
						.setName('message-id')
						.setDescription('ID of the message containing the embed.')
						.setRequired(true)
				)
				.addChannelOption(option =>
					option.setName('channel').setDescription('Channel containing the message.').addChannelTypes(ChannelType.GuildText)
				)
				.addStringOption(option =>
					option.setName('title').setDescription('New title.').setMaxLength(256)
				)
				.addStringOption(option =>
					option.setName('description').setDescription('New text; use \\n for new lines.').setMaxLength(4000)
				)
				.addStringOption(option =>
					option.setName('color').setDescription('New hex color, for example #5865F2.').setMinLength(6).setMaxLength(8)
				)
				.addStringOption(option =>
					option.setName('footer').setDescription('New footer text.').setMaxLength(2048)
				)
				.addStringOption(option =>
					option.setName('image').setDescription('New URL for the large image.')
				)
				.addStringOption(option =>
					option.setName('thumbnail').setDescription('New URL for the small image.')
				)
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('editor')
				.setDescription('Open a text editor that supports Enter and Shift+Enter.')
				.addChannelOption(option =>
					option
						.setName('channel')
						.setDescription('Channel where the embed will be posted.')
						.addChannelTypes(ChannelType.GuildText)
				)
		),

	async execute(interaction) {
		if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({
				content: 'Only a server administrator can use this command.',
				ephemeral: true,
			});
			return;
		}

		const subcommand = interaction.options.getSubcommand();

		if (subcommand === 'editor') {
			const channel = interaction.options.getChannel('channel') || interaction.channel;
			const modal = new ModalBuilder()
				.setCustomId(`embed:editor:${channel.id}`)
				.setTitle('Create embed');
			const titleInput = new TextInputBuilder()
				.setCustomId('title')
				.setLabel('Title')
				.setStyle(TextInputStyle.Short)
				.setMaxLength(256)
				.setRequired(true);
			const descriptionInput = new TextInputBuilder()
				.setCustomId('description')
				.setLabel('Description')
				.setPlaceholder('Use Enter or Shift+Enter for new and blank lines.')
				.setStyle(TextInputStyle.Paragraph)
				.setMaxLength(4000)
				.setRequired(true);
			const colorInput = new TextInputBuilder()
				.setCustomId('color')
				.setLabel('Hex color')
				.setPlaceholder('#5865F2')
				.setStyle(TextInputStyle.Short)
				.setMinLength(6)
				.setMaxLength(8)
				.setRequired(true);
			const footerInput = new TextInputBuilder()
				.setCustomId('footer')
				.setLabel('Footer (optional)')
				.setStyle(TextInputStyle.Paragraph)
				.setMaxLength(2048)
				.setRequired(false);
			const imageInput = new TextInputBuilder()
				.setCustomId('image')
				.setLabel('Image URL (optional)')
				.setStyle(TextInputStyle.Short)
				.setRequired(false);

			modal.addComponents(
				new ActionRowBuilder().addComponents(titleInput),
				new ActionRowBuilder().addComponents(descriptionInput),
				new ActionRowBuilder().addComponents(colorInput),
				new ActionRowBuilder().addComponents(footerInput),
				new ActionRowBuilder().addComponents(imageInput)
			);
			await interaction.showModal(modal);
			return;
		}

		const colorInput = interaction.options.getString('color');
		const color = colorInput ? parseColor(colorInput) : null;

		if (colorInput && color === null) {
			await interaction.reply({
				content: 'Use a valid hex color, for example `#5865F2`.',
				ephemeral: true,
			});
			return;
		}

		const channel = interaction.options.getChannel('channel') || interaction.channel;
		const footer = interaction.options.getString('footer');
		const image = interaction.options.getString('image');
		const thumbnail = interaction.options.getString('thumbnail');

		if ((image && !isHttpUrl(image)) || (thumbnail && !isHttpUrl(thumbnail))) {
			await interaction.reply({
				content: 'Use a complete `https://` link for images.',
				ephemeral: true,
			});
			return;
		}

		if (subcommand === 'edit') {
			const suppliedValues = [
				interaction.options.getString('title'),
				interaction.options.getString('description'),
				colorInput,
				footer,
				image,
				thumbnail,
			];

			if (!suppliedValues.some(value => value !== null)) {
				await interaction.reply({
					content: 'Provide at least one field to edit.',
					ephemeral: true,
				});
				return;
			}

			const messageId = interaction.options.getString('message-id');
			const message = await channel.messages.fetch(messageId).catch(() => null);

			if (!message || message.author.id !== interaction.client.user.id || !message.embeds.length) {
				await interaction.reply({
					content: 'No embed message from this bot was found. Check the channel and message ID.',
					ephemeral: true,
				});
				return;
			}

			const embed = EmbedBuilder.from(message.embeds[0]);
			const title = interaction.options.getString('title');
			const description = interaction.options.getString('description');

			if (title) embed.setTitle(withNewLines(title));
			if (description) embed.setDescription(withNewLines(description));
			if (color !== null) embed.setColor(color);
			if (footer) embed.setFooter({ text: withNewLines(footer) });
			if (image) embed.setImage(image);
			if (thumbnail) embed.setThumbnail(thumbnail);

			await message.edit({ embeds: [embed] });
			await interaction.reply({
				content: `Embed updated in ${channel}.`,
				ephemeral: true,
			});
			return;
		}

		const embed = new EmbedBuilder()
			.setColor(color)
			.setTitle(withNewLines(interaction.options.getString('title')))
			.setDescription(withNewLines(interaction.options.getString('description')));

		if (footer) {
			embed.setFooter({ text: withNewLines(footer) });
		}

		if (image) {
			embed.setImage(image);
		}

		if (thumbnail) {
			embed.setThumbnail(thumbnail);
		}

		await channel.send({ embeds: [embed] });
		await interaction.reply({
			content: `Embed posted in ${channel}.`,
			ephemeral: true,
		});
	},

	async handleModalSubmit(interaction) {
		if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({
				content: 'Only a server administrator can use this form.',
				ephemeral: true,
			});
			return;
		}

		const [, action, channelId] = interaction.customId.split(':');

		if (action !== 'editor') {
			return;
		}

		const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

		if (!channel || !channel.isTextBased()) {
			await interaction.reply({ content: 'The selected channel no longer exists.', ephemeral: true });
			return;
		}

		const color = parseColor(interaction.fields.getTextInputValue('color'));
		const image = interaction.fields.getTextInputValue('image').trim();

		if (color === null) {
			await interaction.reply({
				content: 'Use a valid hex color, for example `#5865F2`.',
				ephemeral: true,
			});
			return;
		}

		if (image && !isHttpUrl(image)) {
			await interaction.reply({
				content: 'Use a complete `https://` link for the image.',
				ephemeral: true,
			});
			return;
		}

		const footer = interaction.fields.getTextInputValue('footer').trim();
		const embed = new EmbedBuilder()
			.setColor(color)
			.setTitle(interaction.fields.getTextInputValue('title'))
			.setDescription(interaction.fields.getTextInputValue('description'));

		if (footer) embed.setFooter({ text: footer });
		if (image) embed.setImage(image);

		await channel.send({ embeds: [embed] });
		await interaction.reply({
			content: `Embed posted in ${channel}.`,
			ephemeral: true,
		});
	},

	parseColor,
};
