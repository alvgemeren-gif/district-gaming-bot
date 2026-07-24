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
		)
		.addStringOption(option =>
			option
				.setName('footer')
				.setDescription('Optionele tekst onderaan de embed.')
				.setMaxLength(2048)
		)
		.addStringOption(option =>
			option
				.setName('afbeelding')
				.setDescription('Optionele URL van een grote afbeelding.')
		)
		.addStringOption(option =>
			option
				.setName('thumbnail')
				.setDescription('Optionele URL van een kleine afbeelding rechtsboven.')
		),

	async execute(interaction) {
		const color = parseColor(interaction.options.getString('kleur'));

		if (color === null) {
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
