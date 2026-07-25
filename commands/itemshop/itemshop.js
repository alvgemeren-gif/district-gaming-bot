const {
	ChannelType,
	PermissionFlagsBits,
	SlashCommandBuilder,
} = require('discord.js');
const { publishShop } = require('../../utils/fortniteShop');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('itemshop')
		.setDescription('Post up to 10 new items from the Fortnite Item Shop.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addChannelOption(option =>
			option
				.setName('channel')
				.setDescription('The channel for the live Item Shop.')
				.addChannelTypes(ChannelType.GuildText)
		),

	async execute(interaction) {
		if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({ content: 'Only an administrator can post the Item Shop.', ephemeral: true });
			return;
		}
		await interaction.deferReply({ ephemeral: true });
		const channel = interaction.options.getChannel('channel') || interaction.channel;
		try {
			const result = await publishShop(interaction.guild, channel);
			await interaction.editReply(
				`The latest Fortnite Item Shop items are now in ${channel}: ${result.offers} new offer(s).`
			);
		} catch (error) {
			console.error('Item shop command error:', error);
			await interaction.editReply('The Fortnite Item Shop could not be retrieved. Please try again later.');
		}
	},
};
