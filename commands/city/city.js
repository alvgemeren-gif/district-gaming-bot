const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
module.exports = {
	data: new SlashCommandBuilder().setName('city').setDescription('Open District Dominion, the district city game'),
	async execute(interaction) {
		const base = (process.env.CITY_GAME_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
		if (!base) return interaction.reply({ content: 'The city game URL is not configured yet.', ephemeral: true });
		const embed = new EmbedBuilder().setColor(0x7c5cff).setTitle('DISTRICT DOMINION').setDescription('Build your city. Grow your district. Rule the season.');
		const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(`${base}/city`).setLabel('Launch city'));
		return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
	},
};
