const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	SlashCommandBuilder,
} = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('daily')
		.setDescription('Play today’s Signal Loom challenge.'),

	async execute(interaction) {
		const baseUrl = process.env.DAILY_GAME_URL || process.env.RENDER_EXTERNAL_URL || process.env.DASHBOARD_URL;
		if (!baseUrl) {
			await interaction.reply({ content: 'The daily game URL has not been configured yet.', ephemeral: true });
			return;
		}
		const url = `${baseUrl.replace(/\/+$/, '').replace(/\/admin$|\/daily$/, '')}/daily`;
		await interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setColor(0x8ee8c1)
					.setTitle('Signal Loom · Daily challenge')
					.setDescription('Read the hidden pattern, repair five signals, and earn up to **10 district points**. One run every 24 hours.')
					.setFooter({ text: 'Takes about 2–4 minutes · Mobile friendly' }),
			],
			components: [
				new ActionRowBuilder().addComponents(
					new ButtonBuilder().setLabel('Play Signal Loom').setStyle(ButtonStyle.Link).setURL(url)
				),
			],
		});
	},
};
