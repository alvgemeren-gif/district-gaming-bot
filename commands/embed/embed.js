const {
	ChannelType,
	EmbedBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
} = require('discord.js');

function parseHexColor(value) {
	const normalized = value.trim().replace(/^#/, '').replace(/^0x/i, '');

	if (!/^[0-9a-f]{6}$/i.test(normalized)) {
		return null;
	}

	return Number.parseInt(normalized, 16);
}

function formatText(value) {
	return value.replaceAll('\\n', '\n');
}

function isValidHttpUrl(value) {
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
		.setDescription('Maak een embed met je eigen kleur.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
		.addStringOption(option =>
			option
				.setName('titel')
				.setDescription('Titel van de embed.')
				.setMaxLength(256)
				.setRequired(true)
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
			option
				.setName('kanaal')
				.setDescription('Kanaal waarin de embed geplaatst wordt.')
				.addChannelTypes(ChannelType.GuildText)
				.setRequired(false)
		)
		.addStringOption(option =>
			option
				.setName('footer')
				.setDescription('Optionele tekst onderaan de embed.')
				.setMaxLength(2048)
				.setRequired(false)
		)
		.addStringOption(option =>
			option
				.setName('afbeelding')
				.setDescription('Optionele URL van een grote afbeelding.')
				.setRequired(false)
		)
		.addStringOption(option =>
			option
				.setName('thumbnail')
				.setDescription('Optionele URL van een kleine afbeelding rechtsboven.')
				.setRequired(false)
		),

	async execute(interaction) {
		const colorInput = interaction.options.getString('kleur');
		const color = parseHexColor(colorInput);

		if (color === null) {
			await interaction.reply({
				content: 'Ongeldige kleurcode. Gebruik een hexkleur zoals `#5865F2`, `5865F2` of `0x5865F2`.',
				ephemeral: true,
			});
			return;
		}

		const channel = interaction.options.getChannel('kanaal') || interaction.channel;
		const footer = interaction.options.getString('footer');
		const imageUrl = interaction.options.getString('afbeelding');
		const thumbnailUrl = interaction.options.getString('thumbnail');

		if ((imageUrl && !isValidHttpUrl(imageUrl)) || (thumbnailUrl && !isValidHttpUrl(thumbnailUrl))) {
			await interaction.reply({
				content: 'De afbeelding of thumbnail heeft geen geldige URL. Gebruik een volledige `https://`-link.',
				ephemeral: true,
			});
			return;
		}

		const embed = new EmbedBuilder()
			.setColor(color)
			.setTitle(formatText(interaction.options.getString('titel')))
			.setDescription(formatText(interaction.options.getString('beschrijving')));

		if (footer) {
			embed.setFooter({ text: formatText(footer) });
		}

		if (imageUrl) {
			embed.setImage(imageUrl);
		}

		if (thumbnailUrl) {
			embed.setThumbnail(thumbnailUrl);
		}

		await channel.send({ embeds: [embed] });
		await interaction.reply({
			content: `Embed geplaatst in ${channel}.`,
			ephemeral: true,
		});
	},

	parseHexColor,
};
