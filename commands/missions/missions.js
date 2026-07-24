const axios = require('axios');
const crypto = require('crypto');
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { getRoleChoice, getRoleConfig } = require('../../utils/roleChoiceStore');
const {
	createMissionClaim,
	getMission,
	getWeekKey,
	getWeeklyMissions,
} = require('../../utils/missionStore');

const MAX_PROOF_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

module.exports = {
	data: new SlashCommandBuilder()
		.setName('missions')
		.setDescription('View or submit this week’s difficult Fortnite team missions.')
		.addSubcommand(subcommand =>
			subcommand
				.setName('list')
				.setDescription('View this week’s missions and your district’s progress.')
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('submit')
				.setDescription('Submit proof that your district completed a mission.')
				.addStringOption(option =>
					option
						.setName('mission-id')
						.setDescription('Mission ID shown in /missions list.')
						.setRequired(true)
				)
				.addAttachmentOption(option =>
					option
						.setName('proof')
						.setDescription('Screenshot proving the mission was completed.')
						.setRequired(true)
				)
				.addStringOption(option =>
					option
						.setName('note')
						.setDescription('Optional explanation for staff.')
						.setMaxLength(500)
				)
		),

	async execute(interaction) {
		try {
			const subcommand = interaction.options.getSubcommand();
			const choice = await getRoleChoice(interaction.guildId, interaction.user.id);

			if (subcommand === 'list') {
				const missions = await getWeeklyMissions(interaction.guildId, choice?.role_id || null);
				const description = missions.length
					? missions.map(mission => {
						const status = mission.claim_status === 'approved'
							? '✅ Completed by your district'
							: mission.claim_status === 'pending'
								? '⏳ Proof awaiting staff review'
								: '❌ Not completed by your district';
						return `**#${mission.id} — ${mission.title}** · **20 points**\n` +
							`${mission.description}\n${status}`;
					}).join('\n\n')
					: 'No missions have been published for this week.';
				const embed = new EmbedBuilder()
					.setColor(0x9b59b6)
					.setTitle(`Weekly Fortnite Missions · ${getWeekKey()}`)
					.setDescription(description)
					.setFooter({ text: 'Any district member may submit proof; each district can complete each mission once.' });

				await interaction.reply({ embeds: [embed] });
				return;
			}

			await interaction.deferReply({ ephemeral: true });
			const districtRoles = await getRoleConfig(interaction.guildId);

			if (!choice || !districtRoles?.includes(choice.role_id)) {
				await interaction.editReply('Choose a district role before submitting mission proof.');
				return;
			}

			const missionId = interaction.options.getString('mission-id');
			const mission = await getMission(interaction.guildId, missionId);

			if (!mission || mission.week_key !== getWeekKey()) {
				await interaction.editReply('That mission is not active for the current week.');
				return;
			}

			const proof = interaction.options.getAttachment('proof');

			if (!ALLOWED_IMAGE_TYPES.has(proof.contentType) || proof.size > MAX_PROOF_BYTES) {
				await interaction.editReply('Upload a PNG, JPEG, or WebP image no larger than 8 MB.');
				return;
			}

			const response = await axios.get(proof.url, {
				responseType: 'arraybuffer',
				timeout: 15000,
				maxContentLength: MAX_PROOF_BYTES,
				maxBodyLength: MAX_PROOF_BYTES,
			});
			const proofData = Buffer.from(response.data);
			const proofHash = crypto.createHash('sha256').update(proofData).digest('hex');
			const claim = await createMissionClaim({
				missionId: mission.id,
				guildId: interaction.guildId,
				userId: interaction.user.id,
				districtRoleId: choice.role_id,
				proofHash,
				proofData,
				proofMime: proof.contentType,
				proofUrl: proof.url,
				note: interaction.options.getString('note'),
			});

			await interaction.editReply(
				`Mission proof submitted as claim #${claim.id}. ` +
				'Your district receives 20 points only after staff approval.'
			);
		} catch (error) {
			console.error('Mission command error:', error);
			const content = error.code === '23505'
				? 'Your district already submitted this mission, or this proof image was already used.'
				: 'The mission submission could not be stored.';

			if (interaction.deferred || interaction.replied) {
				await interaction.editReply(content).catch(() => {});
			} else {
				await interaction.reply({ content, ephemeral: true });
			}
		}
	},
};
