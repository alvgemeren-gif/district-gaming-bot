const {
	ChannelType,
	PermissionFlagsBits,
	SlashCommandBuilder,
} = require('discord.js');
const { publishShop } = require('../../utils/fortniteShop');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('itemshop')
		.setDescription('Plaats de live Fortnite Item Shop.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addChannelOption(option =>
			option
				.setName('kanaal')
				.setDescription('Het kanaal voor de live Item Shop.')
				.addChannelTypes(ChannelType.GuildText)
		),

	async execute(interaction) {
		if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({ content: 'Alleen een administrator kan de Item Shop plaatsen.', ephemeral: true });
			return;
		}
		await interaction.deferReply({ ephemeral: true });
		const channel = interaction.options.getChannel('kanaal') || interaction.channel;
		try {
			const result = await publishShop(interaction.guild, channel);
			await interaction.editReply(
				`De live Fortnite Item Shop staat in ${channel}: ${result.offers} aanbiedingen verdeeld over ${result.messages} bericht(en).`
			);
		} catch (error) {
			console.error('Item shop command error:', error);
			await interaction.editReply('De Fortnite Item Shop kon nu niet worden opgehaald. Probeer het later opnieuw.');
		}
	},
};
