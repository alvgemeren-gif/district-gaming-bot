const axios = require('axios');
const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	SlashCommandBuilder,
} = require('discord.js');

const API_URL = 'https://meme-api.com/gimme';
const REQUEST_OPTIONS = { timeout: 8000 };

function isSafeMeme(meme) {
	return Boolean(
		meme
		&& !meme.nsfw
		&& !meme.spoiler
		&& typeof meme.title === 'string'
		&& /^https:\/\//.test(meme.url || '')
	);
}

async function getRandomMeme() {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const { data } = await axios.get(API_URL, REQUEST_OPTIONS);
		if (isSafeMeme(data)) return data;
	}
	throw new Error('The meme API did not return a safe image.');
}

function memeMessage(meme) {
	const embed = new EmbedBuilder()
		.setColor(0xfee75c)
		.setTitle(meme.title.slice(0, 256))
		.setImage(meme.url)
		.setFooter({
			text: `r/${meme.subreddit || 'memes'}${Number.isFinite(meme.ups) ? ` • 👍 ${meme.ups}` : ''}`,
		});
	if (/^https:\/\//.test(meme.postLink || '')) embed.setURL(meme.postLink);

	return {
		embeds: [embed],
		components: [new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId('meme:nieuw')
				.setLabel('Nog een meme')
				.setEmoji('🎲')
				.setStyle(ButtonStyle.Primary)
		)],
	};
}

async function sendMeme(interaction) {
	try {
		const meme = await getRandomMeme();
		await interaction.editReply(memeMessage(meme));
	} catch (error) {
		console.error('Could not fetch a random meme:', error.message);
		await interaction.editReply({
			content: 'Ik kon nu geen meme ophalen. Probeer het over een moment opnieuw.',
			embeds: [],
			components: [],
		});
	}
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('meme')
		.setDescription('Toon een willekeurige meme.'),

	async execute(interaction) {
		await interaction.deferReply();
		await sendMeme(interaction);
	},

	async handleButton(interaction) {
		if (interaction.customId !== 'meme:nieuw') return;
		await interaction.deferUpdate();
		await sendMeme(interaction);
	},

	isSafeMeme,
	memeMessage,
};
