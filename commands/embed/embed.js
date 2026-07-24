const {
	ChannelType,
	EmbedBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
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
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
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
		),

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();
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

	parseColor,
};
