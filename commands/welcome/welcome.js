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
const {
	deleteWelcomeConfig,
	enableWelcomeConfig,
	formatWelcomeMessage,
	getWelcomeConfig,
	setWelcomeConfig,
} = require('../../utils/welcomeConfig');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('welcome')
		.setDescription('Configure the automatic welcome message.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand(subcommand =>
			subcommand
				.setName('editor')
				.setDescription('Open the multiline welcome message editor.')
				.addChannelOption(option =>
					option
						.setName('channel')
						.setDescription('Channel where new members will be welcomed.')
						.addChannelTypes(ChannelType.GuildText)
						.setRequired(true)
				)
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('test')
				.setDescription('Send a test using the saved welcome message.')
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('status')
				.setDescription('View the current welcome message configuration.')
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('enable')
				.setDescription('Enable the previously saved welcome message.')
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('disable')
				.setDescription('Disable automatic welcome messages.')
		),

	async execute(interaction) {
		if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({
				content: 'Only a server administrator can use this command.',
				ephemeral: true,
			});
			return;
		}

		try {
			const subcommand = interaction.options.getSubcommand();

			if (subcommand === 'editor') {
				const channel = interaction.options.getChannel('channel');
				const existing = await getWelcomeConfig(interaction.guildId);
				const input = new TextInputBuilder()
					.setCustomId('message')
					.setLabel('Welcome message')
					.setPlaceholder('Welcome {user} to {server}!')
					.setStyle(TextInputStyle.Paragraph)
					.setMaxLength(1900)
					.setRequired(true)
					.setValue(existing?.message || 'Welcome {user} to {server}!');
				const modal = new ModalBuilder()
					.setCustomId(`welcome:editor:${channel.id}`)
					.setTitle('Welcome message editor')
					.addComponents(new ActionRowBuilder().addComponents(input));

				await interaction.showModal(modal);
				return;
			}

			if (subcommand === 'disable') {
				await deleteWelcomeConfig(interaction.guildId);
				await interaction.reply({
					content: 'Automatic welcome messages have been disabled.',
					ephemeral: true,
				});
				return;
			}

			if (subcommand === 'enable') {
				const enabled = await enableWelcomeConfig(interaction.guildId);
				await interaction.reply({
					content: enabled
						? 'Automatic welcome messages have been enabled.'
						: 'No saved welcome message exists. Configure one first with `/welcome editor`.',
					ephemeral: true,
				});
				return;
			}

			const config = await getWelcomeConfig(interaction.guildId);

			if (!config) {
				await interaction.reply({
					content: 'No welcome message is currently configured.',
					ephemeral: true,
				});
				return;
			}

			if (subcommand === 'status') {
				const embed = new EmbedBuilder()
					.setColor(0x57f287)
					.setTitle('Welcome system status')
					.addFields(
						{ name: 'Channel', value: `<#${config.channelId}>` },
						{ name: 'Message template', value: config.message }
					);
				await interaction.reply({ embeds: [embed], ephemeral: true });
				return;
			}

			const channel = await interaction.guild.channels.fetch(config.channelId).catch(() => null);

			if (!channel?.isTextBased()) {
				await interaction.reply({
					content: 'The configured welcome channel no longer exists.',
					ephemeral: true,
				});
				return;
			}

			const member = await interaction.guild.members.fetch(interaction.user.id);
			await channel.send(formatWelcomeMessage(config.message, member));
			await interaction.reply({
				content: `Test welcome message sent in ${channel}.`,
				ephemeral: true,
			});
		} catch (error) {
			console.error('Welcome command error:', error);
			await interaction.reply({
				content: 'The welcome configuration could not be loaded or saved.',
				ephemeral: true,
			}).catch(() => {});
		}
	},

	async handleModalSubmit(interaction) {
		if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({
				content: 'Only a server administrator can use this form.',
				ephemeral: true,
			});
			return;
		}

		try {
			const [, action, channelId] = interaction.customId.split(':');

			if (action !== 'editor') {
				return;
			}

			const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

			if (!channel?.isTextBased()) {
				await interaction.reply({
					content: 'The selected welcome channel no longer exists.',
					ephemeral: true,
				});
				return;
			}

			await setWelcomeConfig(interaction.guildId, {
				channelId,
				message: interaction.fields.getTextInputValue('message'),
			});
			await interaction.reply({
				content: `Automatic welcome messages are now enabled in ${channel}.`,
				ephemeral: true,
			});
		} catch (error) {
			console.error('Welcome modal error:', error);
			await interaction.reply({
				content: 'The welcome message could not be saved.',
				ephemeral: true,
			}).catch(() => {});
		}
	},
};
