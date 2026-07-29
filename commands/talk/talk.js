const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ModalBuilder,
	SlashCommandBuilder,
	TextInputBuilder,
	TextInputStyle,
} = require('discord.js');
const { requestAiReply, trimHistory } = require('../../utils/aiConversation');

const SESSION_TTL = 30 * 60 * 1000;
const sessions = new Map();

const data = new SlashCommandBuilder()
	.setName('talk')
	.setDescription('Begin een gesprek met de AI.')
	.addStringOption(option =>
		option
			.setName('bericht')
			.setDescription('Optioneel: waarmee wil je het gesprek beginnen?')
			.setMaxLength(1000)
	);

function sessionKey(interaction) {
	return `${interaction.guildId || 'dm'}:${interaction.channelId}:${interaction.user.id}`;
}

function conversationButtons() {
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId('talk:reply')
			.setLabel('Antwoorden')
			.setEmoji('💬')
			.setStyle(ButtonStyle.Primary),
		new ButtonBuilder()
			.setCustomId('talk:stop')
			.setLabel('Gesprek stoppen')
			.setStyle(ButtonStyle.Secondary)
	);
}

function getSession(interaction) {
	const key = sessionKey(interaction);
	const session = sessions.get(key);

	if (!session || Date.now() - session.updatedAt > SESSION_TTL) {
		sessions.delete(key);
		return null;
	}

	return session;
}

function saveSession(interaction, messages) {
	sessions.set(sessionKey(interaction), {
		messages: trimHistory(messages),
		updatedAt: Date.now(),
	});
}

async function generateTurn(interaction, userMessage) {
	const existing = getSession(interaction);
	const messages = [
		...(existing?.messages || []),
		{ role: 'user', content: userMessage },
	];
	const reply = await requestAiReply(messages);
	saveSession(interaction, [
		...messages,
		{ role: 'assistant', content: reply },
	]);
	return reply;
}

async function sendAiError(interaction, error) {
	console.error('Talk AI request failed:', error.message);
	const content = error.code === 'OPENAI_API_KEY_MISSING'
		? 'De AI is nog niet ingesteld. Een beheerder moet `OPENAI_API_KEY` toevoegen aan de omgevingsvariabelen.'
		: 'De AI kon nu niet antwoorden. Probeer het over een moment opnieuw.';

	if (interaction.deferred || interaction.replied) {
		await interaction.editReply({ content, components: [] });
	} else {
		await interaction.reply({ content, ephemeral: true });
	}
}

module.exports = {
	data,
	SESSION_TTL,
	sessions,
	conversationButtons,
	sessionKey,

	async execute(interaction) {
		await interaction.deferReply();
		const openingMessage = interaction.options.getString('bericht') ||
			'Begin zelf een gezellig gesprek met mij. Stel één leuke, open vraag.';

		try {
			const reply = await generateTurn(interaction, openingMessage);
			await interaction.editReply({
				content: `🤖 **AI:** ${reply}`,
				components: [conversationButtons()],
				allowedMentions: { parse: [] },
			});
		} catch (error) {
			await sendAiError(interaction, error);
		}
	},

	async handleButton(interaction) {
		const action = interaction.customId.split(':')[1];

		if (action === 'stop') {
			sessions.delete(sessionKey(interaction));
			await interaction.reply({ content: 'Het gesprek is gestopt. Gebruik `/talk` om opnieuw te beginnen.', ephemeral: true });
			return;
		}

		if (!getSession(interaction)) {
			await interaction.reply({ content: 'Dit gesprek is verlopen. Start een nieuw gesprek met `/talk`.', ephemeral: true });
			return;
		}

		const input = new TextInputBuilder()
			.setCustomId('message')
			.setLabel('Wat wil je tegen de AI zeggen?')
			.setStyle(TextInputStyle.Paragraph)
			.setMinLength(1)
			.setMaxLength(1000)
			.setRequired(true);
		const modal = new ModalBuilder()
			.setCustomId('talk:submit')
			.setTitle('Praat met de AI')
			.addComponents(new ActionRowBuilder().addComponents(input));

		await interaction.showModal(modal);
	},

	async handleModalSubmit(interaction) {
		if (!getSession(interaction)) {
			await interaction.reply({ content: 'Dit gesprek is verlopen. Start een nieuw gesprek met `/talk`.', ephemeral: true });
			return;
		}

		await interaction.deferReply();

		try {
			const message = interaction.fields.getTextInputValue('message');
			const reply = await generateTurn(interaction, message);
			await interaction.editReply({
				content: `**${interaction.user.displayName}:** ${message}\n\n🤖 **AI:** ${reply}`,
				components: [conversationButtons()],
				allowedMentions: { parse: [] },
			});
		} catch (error) {
			await sendAiError(interaction, error);
		}
	},
};
