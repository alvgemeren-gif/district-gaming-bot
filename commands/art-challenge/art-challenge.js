const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	SlashCommandBuilder,
} = require('discord.js');
const {
	createSubmission,
	deleteSubmission,
	getConfig,
	getCurrentChallenge,
	setSubmissionMessage,
	toggleVote,
} = require('../../utils/artChallengeStore');

const data = new SlashCommandBuilder()
	.setName('art-challenge')
	.setDescription('View the weekly art challenge or submit your artwork.')
	.addSubcommand(command => command
		.setName('current')
		.setDescription('View the current weekly art challenge.'))
	.addSubcommand(command => command
		.setName('submit')
		.setDescription('Submit your artwork to the current challenge.')
		.addAttachmentOption(option => option
			.setName('artwork')
			.setDescription('Your original artwork as an image.')
			.setRequired(true))
		.addStringOption(option => option
			.setName('caption')
			.setDescription('Optional title or short description of your artwork.')
			.setMaxLength(500)));

function voteButton(submissionId, count = 0) {
	return new ButtonBuilder()
		.setCustomId(`art-challenge:vote:${submissionId}`)
		.setLabel(`Vote · ${count}`)
		.setEmoji('🎨')
		.setStyle(ButtonStyle.Primary);
}

module.exports = {
	data,

	async execute(interaction) {
		try {
			const challenge = await getCurrentChallenge(interaction.guildId);
			if (!challenge) {
				await interaction.reply({ content: 'There is no active art challenge right now.', ephemeral: true });
				return;
			}

			if (interaction.options.getSubcommand() === 'current') {
				await interaction.reply({
					embeds: [new EmbedBuilder()
						.setColor(0xeb459e)
						.setTitle('Current Weekly Art Challenge')
						.setDescription(challenge.prompt)
						.addFields({
							name: 'Deadline',
							value: `<t:${Math.floor(new Date(challenge.ends_at).getTime() / 1000)}:R>`,
						})],
					ephemeral: true,
				});
				return;
			}

			const config = await getConfig(interaction.guildId);
			const channel = await interaction.guild.channels.fetch(config?.channel_id).catch(() => null);
			if (!channel?.isTextBased()) {
				await interaction.reply({ content: 'The submission channel is unavailable.', ephemeral: true });
				return;
			}

			const artwork = interaction.options.getAttachment('artwork');
			if (!artwork.contentType?.startsWith('image/')) {
				await interaction.reply({ content: 'Please upload an image file.', ephemeral: true });
				return;
			}

			const caption = interaction.options.getString('caption');
			const submission = await createSubmission(
				challenge.id,
				interaction.guildId,
				interaction.user.id,
				artwork.url,
				caption,
			);
			if (!submission) {
				await interaction.reply({
					content: 'You already submitted artwork for this week. One submission is allowed per challenge.',
					ephemeral: true,
				});
				return;
			}

			try {
				const message = await channel.send({
					embeds: [new EmbedBuilder()
						.setColor(0xfee75c)
						.setAuthor({ name: interaction.user.displayName, iconURL: interaction.user.displayAvatarURL() })
						.setTitle(caption || 'Weekly Art Challenge Entry')
						.setDescription(`Submitted by ${interaction.user}`)
						.setImage(artwork.url)
						.setFooter({ text: 'Vote for this artwork using the button below.' })],
					components: [new ActionRowBuilder().addComponents(voteButton(submission.id))],
				});
				await setSubmissionMessage(submission.id, message.id);
			} catch (error) {
				await deleteSubmission(submission.id);
				throw error;
			}

			await interaction.reply({ content: `Your artwork was submitted in ${channel}.`, ephemeral: true });
		} catch (error) {
			console.error('Art challenge command failed:', error);
			if (!interaction.replied) {
				await interaction.reply({ content: 'Something went wrong while processing your artwork.', ephemeral: true }).catch(() => {});
			}
		}
	},

	async handleButton(interaction) {
		const [, action, submissionId] = interaction.customId.split(':');
		if (action !== 'vote' || !submissionId) return;

		try {
			const result = await toggleVote(submissionId, interaction.user.id);
			const row = new ActionRowBuilder().addComponents(voteButton(submissionId, result.count));
			await interaction.update({ components: [row] });
			await interaction.followUp({
				content: result.voted ? 'Your vote was added.' : 'Your vote was removed.',
				ephemeral: true,
			});
		} catch (error) {
			const messages = {
				SELF_VOTE: 'You cannot vote for your own artwork.',
				VOTING_CLOSED: 'Voting for this challenge has closed.',
				SUBMISSION_NOT_FOUND: 'This submission no longer exists.',
			};
			await interaction.reply({
				content: messages[error.message] || 'Your vote could not be processed.',
				ephemeral: true,
			}).catch(() => {});
		}
	},
};
