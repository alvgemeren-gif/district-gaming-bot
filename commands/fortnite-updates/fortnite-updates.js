const {
	ChannelType,
	PermissionFlagsBits,
	SlashCommandBuilder,
} = require('discord.js');
const { publishCurrentUpdates } = require('../../utils/fortniteUpdates');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('fortnite-updates')
		.setDescription('Plaats een live kanaalfeed voor Fortnite game-updates.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addChannelOption(option =>
			option
				.setName('kanaal')
				.setDescription('Het kanaal waarin Fortnite-updates worden geplaatst.')
				.addChannelTypes(ChannelType.GuildText)
				.setRequired(true)
		)
		.addRoleOption(option =>
			option
				.setName('meldingsrol')
				.setDescription('Optionele rol die bij nieuwe updates wordt genoemd.')
		),

	async execute(interaction) {
		if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({ content: 'Alleen een administrator kan de updatefeed instellen.', ephemeral: true });
			return;
		}
		await interaction.deferReply({ ephemeral: true });
		const channel = interaction.options.getChannel('kanaal');
		const role = interaction.options.getRole('meldingsrol');
		try {
			const result = await publishCurrentUpdates(interaction.guild, channel, role?.id || null);
			await interaction.editReply(
				`De Fortnite-updatefeed staat in ${channel}. ${result.news} actuele berichten geplaatst; actieve versie: **${result.version}**.`
			);
		} catch (error) {
			console.error('Fortnite updates command error:', error);
			await interaction.editReply('De Fortnite-updatefeed kon nu niet worden ingesteld. Probeer het later opnieuw.');
		}
	},
};
