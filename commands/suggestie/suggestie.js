const {
	ChannelType,
	EmbedBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
} = require('discord.js');
const {
	deleteSuggestionConfig,
	getSuggestionConfig,
	setSuggestionConfig,
} = require('../../utils/suggestionConfig');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('suggestie')
		.setDescription('Dien suggesties en ideeen in voor de server.')
		.addSubcommand(subcommand =>
			subcommand
				.setName('indienen')
				.setDescription('Stuur een suggestie of idee in.')
				.addStringOption(option =>
					option
						.setName('idee')
						.setDescription('Jouw suggestie of idee.')
						.setMaxLength(1800)
						.setRequired(true)
				)
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('kanaal')
				.setDescription('Stel het suggestiekanaal in.')
				.addChannelOption(option =>
					option
						.setName('kanaal')
						.setDescription('Kanaal waar suggesties geplaatst worden.')
						.addChannelTypes(ChannelType.GuildText)
						.setRequired(true)
				)
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('uit')
				.setDescription('Zet het vaste suggestiekanaal uit.')
		),

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === 'kanaal') {
			if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
				await interaction.reply({
					content: 'Je hebt Manage Server nodig om het suggestiekanaal in te stellen.',
					ephemeral: true,
				});
				return;
			}

			const channel = interaction.options.getChannel('kanaal');
			setSuggestionConfig(interaction.guildId, channel.id);

			await interaction.reply({
				content: `Suggestiekanaal ingesteld op ${channel}.`,
				ephemeral: true,
			});
			return;
		}

		if (subcommand === 'uit') {
			if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
				await interaction.reply({
					content: 'Je hebt Manage Server nodig om het suggestiekanaal uit te zetten.',
					ephemeral: true,
				});
				return;
			}

			deleteSuggestionConfig(interaction.guildId);

			await interaction.reply({
				content: 'Vast suggestiekanaal uitgezet. Suggesties worden nu in het huidige kanaal geplaatst.',
				ephemeral: true,
			});
			return;
		}

		const idea = interaction.options.getString('idee');
		const config = getSuggestionConfig(interaction.guildId);
		const targetChannel = config
			? await interaction.guild.channels.fetch(config.channelId).catch(() => null)
			: interaction.channel;

		if (!targetChannel || !targetChannel.isTextBased()) {
			await interaction.reply({
				content: 'Het ingestelde suggestiekanaal bestaat niet meer of is geen tekstkanaal.',
				ephemeral: true,
			});
			return;
		}

		const embed = new EmbedBuilder()
			.setColor(0xf1c40f)
			.setTitle('Nieuwe suggestie')
			.setDescription(idea.replaceAll('\\n', '\n'))
			.addFields({
				name: 'Ingezonden door',
				value: `${interaction.user}`,
			})
			.setTimestamp();

		const message = await targetChannel.send({ embeds: [embed] });
		await message.react('👍').catch(() => {});
		await message.react('👎').catch(() => {});

		await interaction.reply({
			content: `Suggestie geplaatst in ${targetChannel}.`,
			ephemeral: true,
		});
	},
};
