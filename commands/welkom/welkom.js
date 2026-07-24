const {
	ChannelType,
	ModalBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
	TextInputBuilder,
	TextInputStyle,
	ActionRowBuilder,
} = require('discord.js');
const {
	deleteWelcomeConfig,
	formatWelcomeMessage,
	getWelcomeConfig,
	setWelcomeConfig,
} = require('../../utils/welcomeConfig');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('welkom')
		.setDescription('Beheer het automatische welkomstbericht.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addSubcommand(subcommand =>
			subcommand
				.setName('instellen')
				.setDescription('Stel het welkomstbericht in.')
				.addChannelOption(option =>
					option
						.setName('kanaal')
						.setDescription('Kanaal waar nieuwe leden verwelkomd worden.')
						.addChannelTypes(ChannelType.GuildText)
						.setRequired(true)
				)
				.addStringOption(option =>
					option
						.setName('bericht')
						.setDescription('Gebruik {user}, {username}, {server} en {membercount}.')
						.setMaxLength(1800)
						.setRequired(true)
				)
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('aanpassen')
				.setDescription('Open een tekstvenster waarin Shift+Enter werkt.')
				.addChannelOption(option =>
					option
						.setName('kanaal')
						.setDescription('Kanaal waar nieuwe leden verwelkomd worden.')
						.addChannelTypes(ChannelType.GuildText)
						.setRequired(true)
				)
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('test')
				.setDescription('Stuur een testbericht met de huidige instelling.')
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('uit')
				.setDescription('Zet het automatische welkomstbericht uit.')
		),

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === 'instellen') {
			const channel = interaction.options.getChannel('kanaal');
			const message = interaction.options.getString('bericht');

			setWelcomeConfig(interaction.guildId, {
				channelId: channel.id,
				message,
			});

			await interaction.reply({
				content: `Welkomstbericht ingesteld voor ${channel}.`,
				ephemeral: true,
			});
			return;
		}

		if (subcommand === 'aanpassen') {
			const channel = interaction.options.getChannel('kanaal');
			const existingConfig = getWelcomeConfig(interaction.guildId);
			const modal = new ModalBuilder()
				.setCustomId(`welkom:${channel.id}`)
				.setTitle('Welkomstbericht aanpassen');

			const messageInput = new TextInputBuilder()
				.setCustomId('message')
				.setLabel('Welkomstbericht')
				.setStyle(TextInputStyle.Paragraph)
				.setMaxLength(1800)
				.setRequired(true)
				.setValue(existingConfig?.message || 'Welkom {user} in {server}!');

			modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
			await interaction.showModal(modal);
			return;
		}

		if (subcommand === 'test') {
			const config = getWelcomeConfig(interaction.guildId);

			if (!config) {
				await interaction.reply({
					content: 'Er is nog geen welkomstbericht ingesteld.',
					ephemeral: true,
				});
				return;
			}

			const channel = await interaction.guild.channels.fetch(config.channelId).catch(() => null);

			if (!channel || !channel.isTextBased()) {
				await interaction.reply({
					content: 'Het ingestelde welkomstkanaal bestaat niet meer of is geen tekstkanaal.',
					ephemeral: true,
				});
				return;
			}

			await channel.send(formatWelcomeMessage(config.message, interaction.member));
			await interaction.reply({
				content: `Testbericht verstuurd in ${channel}.`,
				ephemeral: true,
			});
			return;
		}

		deleteWelcomeConfig(interaction.guildId);
		await interaction.reply({
			content: 'Welkomstbericht uitgezet.',
			ephemeral: true,
		});
	},

	async handleModalSubmit(interaction) {
		const [, channelId] = interaction.customId.split(':');
		const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

		if (!channel || !channel.isTextBased()) {
			await interaction.reply({
				content: 'Het gekozen welkomstkanaal bestaat niet meer of is geen tekstkanaal.',
				ephemeral: true,
			});
			return;
		}

		const message = interaction.fields.getTextInputValue('message');

		setWelcomeConfig(interaction.guildId, {
			channelId,
			message,
		});

		await interaction.reply({
			content: `Welkomstbericht ingesteld voor ${channel}.`,
			ephemeral: true,
		});
	},
};
