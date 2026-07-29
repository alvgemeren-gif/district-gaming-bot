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
	.setDescription('Start a conversation with AI.')
	.addStringOption(option =>
		option
			.setName('message')
			.setDescription('Optional: what would you like to talk about?')
			.setMaxLength(1000)
	);

function sessionKey(interaction) {
	return `${interaction.guildId || 'dm'}:${interaction.channelId}:${interaction.user.id}`;
}

function conversationButtons() {
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId('talk:reply')
			.setLabel('Reply')
			.setEmoji('💬')
			.setStyle(ButtonStyle.Primary),
		new ButtonBuilder()
			.setCustomId('talk:stop')
			.setLabel('End conversation')
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
		? 'AI has not been configured yet. An administrator must add `OPENAI_API_KEY` to the environment variables.'
		: 'The AI could not respond right now. Please try again in a moment.';

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
		const openingMessage = interaction.options.getString('message') ||
			'Start a friendly conversation with me. Ask one engaging, open-ended question.';

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
			await interaction.reply({ content: 'The conversation has ended. Use `/talk` to start a new one.', ephemeral: true });
			return;
		}

		if (!getSession(interaction)) {
			await interaction.reply({ content: 'This conversation has expired. Start a new one with `/talk`.', ephemeral: true });
			return;
		}

		const input = new TextInputBuilder()
			.setCustomId('message')
			.setLabel('What would you like to say to the AI?')
			.setStyle(TextInputStyle.Paragraph)
			.setMinLength(1)
			.setMaxLength(1000)
			.setRequired(true);
		const modal = new ModalBuilder()
			.setCustomId('talk:submit')
			.setTitle('Talk with AI')
			.addComponents(new ActionRowBuilder().addComponents(input));

		await interaction.showModal(modal);
	},

	async handleModalSubmit(interaction) {
		if (!getSession(interaction)) {
			await interaction.reply({ content: 'This conversation has expired. Start a new one with `/talk`.', ephemeral: true });
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
