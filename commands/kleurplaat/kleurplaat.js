const { AttachmentBuilder, SlashCommandBuilder } = require('discord.js');
const { generateColoringPage, validateAttachment } = require('../../utils/coloringPage');

const activeUsers = new Set();

module.exports = {
	data: new SlashCommandBuilder()
		.setName('kleurplaat')
		.setDescription('Genereer een downloadbare kleurplaat op basis van jouw eisen en eventueel een afbeelding.')
		.addStringOption(option => option.setName('eisen').setDescription('Beschrijf onderwerp, achtergrond, stijl en wat je wilt behouden of veranderen.').setRequired(true).setMinLength(1).setMaxLength(2000))
		.addAttachmentOption(option => option.setName('afbeelding').setDescription('Referentieafbeelding (PNG, JPG of WebP, maximaal 10 MB); wordt met OpenAI gedeeld.'))
		.addStringOption(option => option.setName('formaat').setDescription('Kies de paginaoriëntatie (standaard staand).').addChoices(
			{ name: 'Staand', value: 'staand' }, { name: 'Liggend', value: 'liggend' }, { name: 'Vierkant', value: 'vierkant' },
		))
		.addStringOption(option => option.setName('detail').setDescription('Hoeveel details wil je inkleuren?').addChoices(
			{ name: 'Eenvoudig', value: 'eenvoudig' }, { name: 'Gemiddeld', value: 'gemiddeld' }, { name: 'Uitgebreid', value: 'uitgebreid' },
		)),

	async execute(interaction) {
		const attachment = interaction.options.getAttachment('afbeelding');
		const requirements = interaction.options.getString('eisen', true).trim();
		let problem;
		try { validateAttachment(attachment); } catch (error) { problem = error.message; }
		if (!requirements) problem = 'Beschrijf eerst hoe je kleurplaat eruit moet zien.';
		if (!process.env.OPENAI_API_KEY) problem = 'De beheerder moet eerst OPENAI_API_KEY instellen voor /kleurplaat.';
		if (activeUsers.has(interaction.user.id)) problem = 'Je kleurplaat wordt al gemaakt. Wacht tot deze klaar is.';
		else if (activeUsers.size >= 2) problem = 'Er worden al twee kleurplaten gemaakt. Probeer het over enkele minuten opnieuw.';
		if (problem) return interaction.reply({ content: problem, ephemeral: true });

		activeUsers.add(interaction.user.id);
		try {
			await interaction.deferReply({ ephemeral: true });
			await interaction.editReply('Je kleurplaat wordt gemaakt. Dit kan enkele minuten duren.');
			const buffer = await generateColoringPage({
				requirements, attachment,
				orientation: interaction.options.getString('formaat') || 'staand',
				detail: interaction.options.getString('detail') || 'gemiddeld',
				maxOutputBytes: interaction.attachmentSizeLimit,
			});
			await interaction.editReply({
				content: 'Je kleurplaat is klaar! Download het PNG-bestand hieronder. Kies bij het afdrukken ‘passen op pagina’.',
				files: [new AttachmentBuilder(buffer, { name: `kleurplaat-${interaction.id}.png`, description: 'Zwart-witte kleurplaat op basis van jouw eisen.' })],
				allowedMentions: { parse: [] },
			});
		} catch (error) {
			// Never log Axios request objects: they contain the API key and reference URL.
			console.error('Coloring page failed:', error.response?.status || error.code || error.name);
			let message = 'Het maken of versturen van de kleurplaat is mislukt. Probeer het later opnieuw.';
			if (error.response?.status === 429) message = 'De beeldgenerator heeft momenteel geen capaciteit of API-tegoed. Probeer het later of vraag de beheerder.';
			else if ([401, 403].includes(error.response?.status)) message = 'De beeldgenerator is niet toegankelijk. Vraag de beheerder de API-sleutel en modeltoegang te controleren.';
			else if (error.response?.status === 400) message = 'De beeldgenerator kon deze aanvraag niet verwerken. Probeer een andere afbeelding of pas je eisen aan.';
			else if (['ECONNABORTED', 'ETIMEDOUT'].includes(error.code)) message = 'Het genereren duurde te lang. Probeer het later opnieuw.';
			else if (!error.isAxiosError && !error.code && error.name === 'Error') message = error.message;
			if (interaction.deferred) await interaction.editReply({ content: message, files: [] });
			else throw error;
		} finally {
			activeUsers.delete(interaction.user.id);
		}
	},
};
