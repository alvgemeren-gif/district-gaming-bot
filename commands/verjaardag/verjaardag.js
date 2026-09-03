const { ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const {
	disableBirthdayConfig,
	getBirthday,
	getBirthdayConfig,
	listBirthdays,
	removeBirthday,
	setBirthday,
	setBirthdayConfig,
} = require('../../utils/birthdayStore');
const { formatBirthday, isValidBirthday, sortUpcoming } = require('../../utils/birthdaySystem');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('verjaardag')
		.setDescription('Registreer en bekijk verjaardagen.')
		.addSubcommand(subcommand => subcommand.setName('instellen').setDescription('Sla je verjaardag op.')
			.addIntegerOption(option => option.setName('dag').setDescription('De dag van de maand.').setMinValue(1).setMaxValue(31).setRequired(true))
			.addIntegerOption(option => option.setName('maand').setDescription('Het nummer van de maand (1-12).').setMinValue(1).setMaxValue(12).setRequired(true)))
		.addSubcommand(subcommand => subcommand.setName('verwijderen').setDescription('Verwijder je opgeslagen verjaardag.'))
		.addSubcommand(subcommand => subcommand.setName('bekijken').setDescription('Bekijk een opgeslagen verjaardag.')
			.addUserOption(option => option.setName('lid').setDescription('Het lid; standaard ben jij dit.')))
		.addSubcommand(subcommand => subcommand.setName('lijst').setDescription('Bekijk de eerstvolgende verjaardagen.'))
		.addSubcommand(subcommand => subcommand.setName('configureren').setDescription('Stel het felicitatiekanaal en de verjaardagsrol in.')
			.addChannelOption(option => option.setName('kanaal').setDescription('Kanaal voor felicitaties.').addChannelTypes(ChannelType.GuildText).setRequired(true))
			.addRoleOption(option => option.setName('rol').setDescription('Optionele rol voor leden die vandaag jarig zijn.')))
		.addSubcommand(subcommand => subcommand.setName('status').setDescription('Bekijk de instellingen van het verjaardagssysteem.'))
		.addSubcommand(subcommand => subcommand.setName('uitschakelen').setDescription('Schakel automatische felicitaties uit.')),

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();
		const isAdminAction = ['configureren', 'status', 'uitschakelen'].includes(subcommand);
		if (isAdminAction && !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({ content: 'Alleen een serverbeheerder kan deze instelling aanpassen.', ephemeral: true });
			return;
		}

		if (subcommand === 'instellen') {
			const day = interaction.options.getInteger('dag');
			const month = interaction.options.getInteger('maand');
			if (!isValidBirthday(day, month)) {
				await interaction.reply({ content: 'Die datum bestaat niet. Controleer de dag en maand.', ephemeral: true });
				return;
			}
			await setBirthday(interaction.guildId, interaction.user.id, day, month);
			await interaction.reply({ content: `🎂 Je verjaardag is opgeslagen als **${formatBirthday(day, month)}**.`, ephemeral: true });
			return;
		}

		if (subcommand === 'verwijderen') {
			const removed = await removeBirthday(interaction.guildId, interaction.user.id);
			await interaction.reply({ content: removed ? 'Je verjaardag is verwijderd.' : 'Je had nog geen verjaardag opgeslagen.', ephemeral: true });
			return;
		}

		if (subcommand === 'bekijken') {
			const user = interaction.options.getUser('lid') || interaction.user;
			const birthday = await getBirthday(interaction.guildId, user.id);
			await interaction.reply({ content: birthday
				? `🎂 De verjaardag van ${user} is **${formatBirthday(birthday.birth_day, birthday.birth_month)}**.`
				: `${user} heeft nog geen verjaardag opgeslagen.`, ephemeral: true });
			return;
		}

		if (subcommand === 'lijst') {
			const birthdays = sortUpcoming(await listBirthdays(interaction.guildId)).slice(0, 20);
			const description = birthdays.length
				? birthdays.map((item, index) => `${index + 1}. <@${item.user_id}> — **${formatBirthday(item.birth_day, item.birth_month)}**`).join('\n')
				: 'Er zijn nog geen verjaardagen opgeslagen.';
			await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xff73ad).setTitle('🎂 Aankomende verjaardagen').setDescription(description)], ephemeral: true });
			return;
		}

		if (subcommand === 'configureren') {
			const channel = interaction.options.getChannel('kanaal');
			const role = interaction.options.getRole('rol');
			if (role?.managed) {
				await interaction.reply({ content: 'Een door een integratie beheerde rol kan niet als verjaardagsrol worden gebruikt.', ephemeral: true });
				return;
			}
			await setBirthdayConfig(interaction.guildId, channel.id, role?.id || null);
			await interaction.reply({ content: `Het verjaardagssysteem is actief in ${channel}${role ? ` met ${role} als verjaardagsrol` : ''}.`, ephemeral: true });
			return;
		}

		if (subcommand === 'uitschakelen') {
			const disabled = await disableBirthdayConfig(interaction.guildId);
			await interaction.reply({ content: disabled ? 'Automatische felicitaties zijn uitgeschakeld.' : 'Het verjaardagssysteem was nog niet ingesteld.', ephemeral: true });
			return;
		}

		const config = await getBirthdayConfig(interaction.guildId, true);
		await interaction.reply({ content: config
			? `Status: **${config.enabled ? 'actief' : 'uitgeschakeld'}**\nKanaal: <#${config.channelId}>\nVerjaardagsrol: ${config.roleId ? `<@&${config.roleId}>` : 'geen'}`
			: 'Het verjaardagssysteem is nog niet ingesteld.', ephemeral: true });
	},
};
