const axios = require('axios');
const crypto = require('crypto');
const { AttachmentBuilder, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { getRoleChoice, getRoleConfig } = require('../../utils/roleChoiceStore');
const {
	createSubmission,
	getLatestSubmission,
	getSubmission,
} = require('../../utils/scoreStore');
const { calculatePoints } = require('../../utils/score');

const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

async function detectVictory(screenshotUrl, screenshotHash) {
	const verifierUrl = process.env.VICTORY_VERIFICATION_URL;

	if (!verifierUrl) {
		return {
			status: 'manual_review',
			confidence: null,
			note: 'No automatic verifier is configured.',
		};
	}

	try {
		const response = await axios.post(
			verifierUrl,
			{ screenshotUrl, sha256: screenshotHash, expectedBanner: '#1 Victory Royale' },
			{
				headers: process.env.VICTORY_VERIFICATION_TOKEN
					? { Authorization: `Bearer ${process.env.VICTORY_VERIFICATION_TOKEN}` }
					: {},
				timeout: 12000,
			}
		);
		const confidence = Number(response.data?.confidence);
		const isVictory = response.data?.isVictory;

		if (!Number.isFinite(confidence) || typeof isVictory !== 'boolean') {
			throw new Error('Verifier returned an invalid response.');
		}

		if (confidence >= 0.99) {
			return {
				status: isVictory ? 'verified' : 'rejected',
				confidence,
				note: response.data?.reason || null,
			};
		}

		return {
			status: 'manual_review',
			confidence,
			note: response.data?.reason || 'Automatic verification was not conclusive.',
		};
	} catch (error) {
		console.error('Victory verification failed:', error.message);
		return {
			status: 'manual_review',
			confidence: null,
			note: 'Automatic verification failed; staff review is required.',
		};
	}
}

function submissionEmbed(submission) {
	const points = submission.status === 'approved'
		? calculatePoints(submission.approved_kills, submission.victory_awarded, submission.crown_victory_awarded)
		: 0;
	return new EmbedBuilder()
		.setColor(submission.status === 'approved' ? 0x57f287 : 0xfee75c)
		.setTitle(`Match submission #${submission.id}`)
		.addFields(
			{ name: 'Match ID', value: submission.match_key, inline: true },
			{ name: 'Status', value: submission.status, inline: true },
			{ name: 'Detection', value: submission.detection_status.replace('_', ' '), inline: true },
			{ name: 'Submitted kills', value: String(submission.submitted_kills), inline: true },
			{ name: 'Win submitted', value: submission.claimed_victory ? 'Yes' : 'No', inline: true },
			{ name: 'Victory awarded', value: submission.victory_awarded ? 'Yes' : 'No', inline: true },
			{ name: 'Crown Victory', value: submission.crown_victory_awarded ? 'Yes (+5)' : 'No', inline: true },
			{ name: 'Points awarded', value: String(points), inline: true }
		)
		.setTimestamp(new Date(submission.created_at));
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('match')
		.setDescription('Submit a Fortnite match or view your latest submission.')
		.addSubcommand(subcommand =>
			subcommand
				.setName('submit')
				.setDescription('Submit your kills or a Victory Royale.')
				.addStringOption(option =>
					option
						.setName('type')
						.setDescription('Choose whether this is a kills or win submission.')
						.addChoices(
							{ name: 'Kills', value: 'kills' },
							{ name: 'Win', value: 'win' }
						)
						.setRequired(true)
				)
				.addIntegerOption(option =>
					option
						.setName('kills')
						.setDescription('Your eliminations in this match.')
						.setMinValue(0)
						.setMaxValue(100)
						.setRequired(true)
				)
				.addAttachmentOption(option =>
					option
						.setName('screenshot')
						.setDescription('Required for a win; mobile photo uploads are supported.')
				)
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('status')
				.setDescription('View your latest or a specific submission.')
				.addStringOption(option =>
					option
						.setName('submission-id')
						.setDescription('Optional submission ID.')
				)
		),

	async execute(interaction) {
		try {
			const subcommand = interaction.options.getSubcommand();

			if (subcommand === 'status') {
				const submissionId = interaction.options.getString('submission-id');
				const submission = submissionId
					? await getSubmission(interaction.guildId, submissionId)
					: await getLatestSubmission(interaction.guildId, interaction.user.id);

				if (!submission || submission.user_id !== interaction.user.id) {
					await interaction.reply({ content: 'No matching submission was found.', ephemeral: true });
					return;
				}

				await interaction.reply({ embeds: [submissionEmbed(submission)], ephemeral: true });
				return;
			}

			await interaction.deferReply({ ephemeral: true });

			const choice = await getRoleChoice(interaction.guildId, interaction.user.id);
			const districtRoles = await getRoleConfig(interaction.guildId);

			if (!choice || !districtRoles?.includes(choice.role_id)) {
				await interaction.editReply('Choose a district role before submitting a match.');
				return;
			}

			const claimedVictory = interaction.options.getString('type') === 'win';
			const screenshot = interaction.options.getAttachment('screenshot');

			if (claimedVictory && !screenshot) {
				await interaction.editReply('Add a Victory Royale screenshot using the upload field.');
				return;
			}

			if (!claimedVictory && screenshot) {
				await interaction.editReply('A kills submission does not need a screenshot. Leave the screenshot field empty.');
				return;
			}

			let screenshotData = null;
			let screenshotHash = null;
			let screenshotMime = null;
			let detection = {
				status: 'not_submitted',
				confidence: null,
				note: null,
			};

			if (screenshot) {
				if (!ALLOWED_IMAGE_TYPES.has(screenshot.contentType) || screenshot.size > MAX_SCREENSHOT_BYTES) {
					await interaction.editReply('Upload a PNG, JPEG, or WebP image no larger than 8 MB.');
					return;
				}

				const response = await axios.get(screenshot.url, {
					responseType: 'arraybuffer',
					timeout: 15000,
					maxContentLength: MAX_SCREENSHOT_BYTES,
					maxBodyLength: MAX_SCREENSHOT_BYTES,
				});
				screenshotData = Buffer.from(response.data);
				screenshotHash = crypto.createHash('sha256').update(screenshotData).digest('hex');
				screenshotMime = screenshot.contentType;
				detection = await detectVictory(screenshot.url, screenshotHash);
			}

			const matchKey = screenshotHash
				? `image-${screenshotHash.slice(0, 24)}`
				: `mobile-${crypto.randomUUID()}`;
			const submission = await createSubmission({
				guildId: interaction.guildId,
				userId: interaction.user.id,
				districtRoleId: choice.role_id,
				matchKey,
				kills: interaction.options.getInteger('kills'),
				claimedVictory,
				screenshotHash,
				screenshotData,
				screenshotMime,
				screenshotUrl: screenshot?.url || null,
				detectionStatus: detection.status,
				detectionConfidence: detection.confidence,
				detectionNote: detection.note,
			});

			await interaction.editReply({
				content: detection.status === 'rejected'
					? 'The screenshot did not pass automatic Victory Royale detection. Staff can still review the kill report.'
					: 'Submission received. Points will be added only after staff approval.',
				embeds: [submissionEmbed(submission)],
			});
		} catch (error) {
			console.error('Match submission error:', error);
			const duplicate = error.code === '23505';
			const content = duplicate
				? 'This match or screenshot has already been submitted.'
				: 'The submission could not be stored. Check the database connection and try again.';

			if (interaction.deferred || interaction.replied) {
				await interaction.editReply({ content, embeds: [] }).catch(() => {});
			} else {
				await interaction.reply({ content, ephemeral: true });
			}
		}
	},

	submissionEmbed,
};
