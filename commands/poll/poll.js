const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { sendDailyPoll } = require('../../utils/dailyPoll');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('poll')
		.setDescription('Test het dagelijkse pollsysteem.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand(subcommand => subcommand
			.setName('test')
			.setDescription('Plaats direct een testpoll.')
			.addChannelOption(option => option
				.setName('kanaal')
				.setDescription('Kanaal voor de testpoll (standaard: dit kanaal).')
				.addChannelTypes(ChannelType.GuildText))),

	async execute(interaction) {
		if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({ content: 'Alleen een serverbeheerder kan een testpoll plaatsen.', ephemeral: true });
			return;
		}
		const channel = interaction.options.getChannel('kanaal') || interaction.channel;
		await interaction.deferReply({ ephemeral: true });
		try {
			await sendDailyPoll(interaction.client, channel.id, new Date(), { test: true });
			await interaction.editReply(`De testpoll is geplaatst in ${channel}.`);
		} catch (error) {
			console.error('Could not post test poll:', error);
			await interaction.editReply('De testpoll kon niet worden geplaatst. Controleer mijn kanaalrechten.');
		}
	},
};
