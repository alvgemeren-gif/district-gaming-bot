const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { sendDailyQuestion } = require('../../utils/dailyPoll');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('vraag')
		.setDescription('Plaats de vraag van vandaag als embed.')
		.setDMPermission(false)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addChannelOption(option => option
			.setName('kanaal')
			.setDescription('Waar moet de vraag komen? Standaard: dit kanaal.')
			.addChannelTypes(ChannelType.GuildText)),

	async execute(interaction) {
		if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({ content: 'Alleen een serverbeheerder kan de dagvraag plaatsen.', ephemeral: true });
			return;
		}
		const channel = interaction.options.getChannel('kanaal') || interaction.channel;
		await interaction.deferReply({ ephemeral: true });
		try {
			const sent = await sendDailyQuestion(interaction.client, channel.id);
			await interaction.editReply(sent
				? `De vraag van vandaag is geplaatst in ${channel}.`
				: `De vraag van vandaag staat al in ${channel}.`);
		} catch (error) {
			console.error('Could not post daily question:', error);
			await interaction.editReply('De vraag kon niet worden geplaatst. Controleer of ik het kanaal en de berichtgeschiedenis kan lezen, berichten kan sturen en links kan insluiten.');
		}
	},
};
