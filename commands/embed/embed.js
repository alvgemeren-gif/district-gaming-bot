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
		.setDescription('Maak of wijzig een embed.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand(subcommand =>
			subcommand
				.setName('maken')
				.setDescription('Maak een nieuwe embed.')
				.addStringOption(option =>
					option.setName('titel').setDescription('Titel van de embed.').setMaxLength(256).setRequired(true)
				)
				.addStringOption(option =>
					option
						.setName('beschrijving')
						.setDescription('Tekst van de embed. Gebruik \\n voor een nieuwe regel.')
						.setMaxLength(4000)
						.setRequired(true)
				)
				.addStringOption(option =>
					option
						.setName('kleur')
						.setDescription('Hexkleur, bijvoorbeeld #5865F2.')
						.setMinLength(6)
						.setMaxLength(8)
						.setRequired(true)
				)
				.addChannelOption(option =>
					option.setName('kanaal').setDescription('Kanaal voor de embed.').addChannelTypes(ChannelType.GuildText)
				)
				.addStringOption(option =>
					option.setName('footer').setDescription('Optionele tekst onderaan.').setMaxLength(2048)
				)
				.addStringOption(option =>
					option.setName('afbeelding').setDescription('Optionele URL van een grote afbeelding.')
				)
				.addStringOption(option =>
					option.setName('thumbnail').setDescription('Optionele URL van een kleine afbeelding.')
				)
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('aanpassen')
				.setDescription('Wijzig een bestaande embed van deze bot.')
				.addStringOption(option =>
					option
						.setName('bericht-id')
						.setDescription('ID van het bericht met de embed.')
						.setRequired(true)
				)
				.addChannelOption(option =>
					option.setName('kanaal').setDescription('Kanaal van het bericht.').addChannelTypes(ChannelType.GuildText)
				)
				.addStringOption(option =>
					option.setName('titel').setDescription('Nieuwe titel.').setMaxLength(256)
				)
				.addStringOption(option =>
					option.setName('beschrijving').setDescription('Nieuwe tekst; gebruik \\n voor regels.').setMaxLength(4000)
				)
				.addStringOption(option =>
					option.setName('kleur').setDescription('Nieuwe hexkleur, bijvoorbeeld #5865F2.').setMinLength(6).setMaxLength(8)
				)
				.addStringOption(option =>
					option.setName('footer').setDescription('Nieuwe footertekst.').setMaxLength(2048)
				)
				.addStringOption(option =>
					option.setName('afbeelding').setDescription('Nieuwe URL voor de grote afbeelding.')
				)
				.addStringOption(option =>
					option.setName('thumbnail').setDescription('Nieuwe URL voor de kleine afbeelding.')
				)
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('editor')
				.setDescription('Open een tekstvenster waarin Enter en Shift+Enter werken.')
				.addChannelOption(option =>
					option
						.setName('kanaal')
						.setDescription('Kanaal waarin de embed geplaatst wordt.')
						.addChannelTypes(ChannelType.GuildText)
				)
		),

	async execute(interaction) {
		if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({
				content: 'Alleen een serverbeheerder kan dit command gebruiken.',
				ephemeral: true,
			});
			return;
		}

		const subcommand = interaction.options.getSubcommand();

		if (subcommand === 'editor') {
			const channel = interaction.options.getChannel('kanaal') || interaction.channel;
			const modal = new ModalBuilder()
				.setCustomId(`embed:editor:${channel.id}`)
				.setTitle('Embed maken');
			const titleInput = new TextInputBuilder()
				.setCustomId('titel')
				.setLabel('Titel')
				.setStyle(TextInputStyle.Short)
				.setMaxLength(256)
				.setRequired(true);
			const descriptionInput = new TextInputBuilder()
				.setCustomId('beschrijving')
				.setLabel('Beschrijving')
				.setPlaceholder('Gebruik Enter of Shift+Enter voor nieuwe en lege regels.')
				.setStyle(TextInputStyle.Paragraph)
				.setMaxLength(4000)
				.setRequired(true);
			const colorInput = new TextInputBuilder()
				.setCustomId('kleur')
				.setLabel('Hexkleur')
				.setPlaceholder('#5865F2')
				.setStyle(TextInputStyle.Short)
				.setMinLength(6)
				.setMaxLength(8)
				.setRequired(true);
			const footerInput = new TextInputBuilder()
				.setCustomId('footer')
				.setLabel('Footer (optioneel)')
				.setStyle(TextInputStyle.Paragraph)
				.setMaxLength(2048)
				.setRequired(false);
			const imageInput = new TextInputBuilder()
				.setCustomId('afbeelding')
				.setLabel('Afbeeldings-URL (optioneel)')
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

		const colorInput = interaction.options.getString('kleur');
		const color = colorInput ? parseColor(colorInput) : null;

		if (colorInput && color === null) {
			await interaction.reply({
				content: 'Gebruik een geldige hexkleur, bijvoorbeeld `#5865F2`.',
				ephemeral: true,
			});
			return;
		}

		const channel = interaction.options.getChannel('kanaal') || interaction.channel;
		const footer = interaction.options.getString('footer');
		const image = interaction.options.getString('afbeelding');
		const thumbnail = interaction.options.getString('thumbnail');

		if ((image && !isHttpUrl(image)) || (thumbnail && !isHttpUrl(thumbnail))) {
			await interaction.reply({
				content: 'Gebruik voor afbeeldingen een volledige `https://`-link.',
				ephemeral: true,
			});
			return;
		}

		if (subcommand === 'aanpassen') {
			const suppliedValues = [
				interaction.options.getString('titel'),
				interaction.options.getString('beschrijving'),
				colorInput,
				footer,
				image,
				thumbnail,
			];

			if (!suppliedValues.some(value => value !== null)) {
				await interaction.reply({
					content: 'Vul minimaal één onderdeel in dat je wilt aanpassen.',
					ephemeral: true,
				});
				return;
			}

			const messageId = interaction.options.getString('bericht-id');
			const message = await channel.messages.fetch(messageId).catch(() => null);

			if (!message || message.author.id !== interaction.client.user.id || !message.embeds.length) {
				await interaction.reply({
					content: 'Ik kon daar geen embedbericht van deze bot vinden. Controleer het kanaal en bericht-ID.',
					ephemeral: true,
				});
				return;
			}

			const embed = EmbedBuilder.from(message.embeds[0]);
			const title = interaction.options.getString('titel');
			const description = interaction.options.getString('beschrijving');

			if (title) embed.setTitle(withNewLines(title));
			if (description) embed.setDescription(withNewLines(description));
			if (color !== null) embed.setColor(color);
			if (footer) embed.setFooter({ text: withNewLines(footer) });
			if (image) embed.setImage(image);
			if (thumbnail) embed.setThumbnail(thumbnail);

			await message.edit({ embeds: [embed] });
			await interaction.reply({
				content: `Embed aangepast in ${channel}.`,
				ephemeral: true,
			});
			return;
		}

		const embed = new EmbedBuilder()
			.setColor(color)
			.setTitle(withNewLines(interaction.options.getString('titel')))
			.setDescription(withNewLines(interaction.options.getString('beschrijving')));

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
			content: `Embed geplaatst in ${channel}.`,
			ephemeral: true,
		});
	},

	async handleModalSubmit(interaction) {
		if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({
				content: 'Alleen een serverbeheerder kan dit formulier gebruiken.',
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
			await interaction.reply({ content: 'Het gekozen kanaal bestaat niet meer.', ephemeral: true });
			return;
		}

		const color = parseColor(interaction.fields.getTextInputValue('kleur'));
		const image = interaction.fields.getTextInputValue('afbeelding').trim();

		if (color === null) {
			await interaction.reply({
				content: 'Gebruik een geldige hexkleur, bijvoorbeeld `#5865F2`.',
				ephemeral: true,
			});
			return;
		}

		if (image && !isHttpUrl(image)) {
			await interaction.reply({
				content: 'Gebruik voor de afbeelding een volledige `https://`-link.',
				ephemeral: true,
			});
			return;
		}

		const footer = interaction.fields.getTextInputValue('footer').trim();
		const embed = new EmbedBuilder()
			.setColor(color)
			.setTitle(interaction.fields.getTextInputValue('titel'))
			.setDescription(interaction.fields.getTextInputValue('beschrijving'));

		if (footer) embed.setFooter({ text: footer });
		if (image) embed.setImage(image);

		await channel.send({ embeds: [embed] });
		await interaction.reply({
			content: `Embed geplaatst in ${channel}.`,
			ephemeral: true,
		});
	},

	parseColor,
};
