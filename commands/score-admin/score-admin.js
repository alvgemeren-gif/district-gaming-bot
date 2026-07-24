const {
	AttachmentBuilder,
	EmbedBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
} = require('discord.js');
const {
	approveSubmission,
	getModerationLogs,
	getPendingSubmissions,
	getSubmission,
	rejectSubmission,
	removeSubmission,
} = require('../../utils/scoreStore');
const { submissionEmbed } = require('../match/match');

function addDecisionOptions(subcommand) {
	return subcommand
		.addStringOption(option =>
			option
				.setName('submission-id')
				.setDescription('Submission ID.')
				.setRequired(true)
		)
		.addBooleanOption(option =>
			option
				.setName('victory')
				.setDescription('Award a Victory Royale for this match.')
				.setRequired(true)
		)
		.addIntegerOption(option =>
			option
				.setName('kills')
				.setDescription('Approved kill count; defaults to the submitted count.')
				.setMinValue(0)
				.setMaxValue(100)
		)
		.addStringOption(option =>
			option
				.setName('note')
				.setDescription('Optional moderation note.')
				.setMaxLength(500)
		);
}

const data = new SlashCommandBuilder()
	.setName('score-admin')
	.setDescription('Moderate Fortnite match submissions.')
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.addSubcommand(subcommand =>
		subcommand
			.setName('review')
			.setDescription('List pending submissions or inspect one submission.')
			.addStringOption(option =>
				option
					.setName('submission-id')
					.setDescription('Optional submission ID to inspect.')
			)
	)
	.addSubcommand(subcommand =>
		addDecisionOptions(
			subcommand
				.setName('approve')
				.setDescription('Approve a submission and award points.')
		)
	)
	.addSubcommand(subcommand =>
		addDecisionOptions(
			subcommand
				.setName('edit')
				.setDescription('Edit the awarded kills or victory status.')
		)
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('reject')
			.setDescription('Reject a submission without awarding points.')
			.addStringOption(option =>
				option.setName('submission-id').setDescription('Submission ID.').setRequired(true)
			)
			.addStringOption(option =>
				option.setName('reason').setDescription('Reason for rejection.').setMaxLength(500).setRequired(true)
			)
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('remove')
			.setDescription('Remove a submission and subtract its awarded points.')
			.addStringOption(option =>
				option.setName('submission-id').setDescription('Submission ID.').setRequired(true)
			)
			.addStringOption(option =>
				option.setName('reason').setDescription('Reason for removal.').setMaxLength(500).setRequired(true)
			)
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('logs')
			.setDescription('View recent scoreboard moderation actions.')
			.addIntegerOption(option =>
				option.setName('limit').setDescription('Number of actions.').setMinValue(1).setMaxValue(20)
			)
	);

function confidenceText(value) {
	return value === null ? 'n/a' : `${Math.round(Number(value) * 100)}%`;
}

module.exports = {
	data,

	async execute(interaction) {
		if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({
				content: 'Only a server administrator can use this command.',
				ephemeral: true,
			});
			return;
		}

		try {
			const subcommand = interaction.options.getSubcommand();

			if (subcommand === 'review') {
				const submissionId = interaction.options.getString('submission-id');

				if (!submissionId) {
					const pending = await getPendingSubmissions(interaction.guildId);
					const description = pending.length
						? pending.map(item =>
							`**#${item.id}** · <@${item.user_id}> · <@&${item.district_role_id}>\n` +
							`Match: \`${item.match_key}\` · Kills: ${item.submitted_kills} · ` +
							`Detection: ${item.detection_status} (${confidenceText(item.detection_confidence)})`
						).join('\n\n')
						: 'There are no pending submissions.';
					await interaction.reply({
						embeds: [new EmbedBuilder().setTitle('Pending match submissions').setDescription(description)],
						ephemeral: true,
					});
					return;
				}

				const submission = await getSubmission(interaction.guildId, submissionId);

				if (!submission) {
					await interaction.reply({ content: 'Submission not found.', ephemeral: true });
					return;
				}

				const embed = submissionEmbed(submission)
					.addFields(
						{ name: 'Player', value: `<@${submission.user_id}>`, inline: true },
						{ name: 'District', value: `<@&${submission.district_role_id}>`, inline: true },
						{
							name: 'Detection confidence',
							value: confidenceText(submission.detection_confidence),
							inline: true,
						},
						{
							name: 'Detection note',
							value: submission.detection_note || 'None',
						}
					);
				const files = submission.screenshot_data
					? [new AttachmentBuilder(submission.screenshot_data, {
						name: `submission-${submission.id}.${submission.screenshot_mime === 'image/png' ? 'png' : 'jpg'}`,
					})]
					: [];

				await interaction.reply({ embeds: [embed], files, ephemeral: true });
				return;
			}

			if (subcommand === 'approve' || subcommand === 'edit') {
				const submissionId = interaction.options.getString('submission-id');
				const current = await getSubmission(interaction.guildId, submissionId);

				if (!current) {
					await interaction.reply({ content: 'Submission not found.', ephemeral: true });
					return;
				}

				const kills = interaction.options.getInteger('kills') ?? current.submitted_kills;
				const victory = interaction.options.getBoolean('victory');
				const updated = await approveSubmission(
					interaction.guildId,
					submissionId,
					interaction.user.id,
					kills,
					victory,
					interaction.options.getString('note'),
					subcommand === 'edit' ? 'edited' : 'approved'
				);

				await interaction.reply({
					content: updated
						? `Submission #${submissionId} ${subcommand === 'edit' ? 'updated' : 'approved'}.`
						: 'Submission not found or already removed.',
					ephemeral: true,
				});
				return;
			}

			if (subcommand === 'reject' || subcommand === 'remove') {
				const submissionId = interaction.options.getString('submission-id');
				const reason = interaction.options.getString('reason');
				const updated = subcommand === 'reject'
					? await rejectSubmission(interaction.guildId, submissionId, interaction.user.id, reason)
					: await removeSubmission(interaction.guildId, submissionId, interaction.user.id, reason);

				await interaction.reply({
					content: updated
						? `Submission #${submissionId} ${subcommand === 'reject' ? 'rejected' : 'removed'}.`
						: 'Submission not found or already removed.',
					ephemeral: true,
				});
				return;
			}

			const logs = await getModerationLogs(
				interaction.guildId,
				interaction.options.getInteger('limit') || 10
			);
			const description = logs.length
				? logs.map(log =>
					`**${log.action}** submission #${log.submission_id || 'n/a'} by <@${log.actor_id}>\n` +
					`<t:${Math.floor(new Date(log.created_at).getTime() / 1000)}:R>`
				).join('\n\n')
				: 'No moderation actions have been logged.';
			await interaction.reply({
				embeds: [new EmbedBuilder().setTitle('Scoreboard moderation log').setDescription(description)],
				ephemeral: true,
			});
		} catch (error) {
			console.error('Score moderation error:', error);
			const duplicateVictory = error.code === '23505';
			await interaction.reply({
				content: duplicateVictory
					? 'A Victory Royale has already been awarded for this match.'
					: error.message || 'The moderation action failed.',
				ephemeral: true,
			}).catch(() => {});
		}
	},
};
