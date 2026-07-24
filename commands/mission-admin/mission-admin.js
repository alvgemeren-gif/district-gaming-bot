const {
	AttachmentBuilder,
	EmbedBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
} = require('discord.js');
const {
	createMission,
	getMissionClaim,
	getMissionLogs,
	getPendingMissionClaims,
	getWeekKey,
	moderateMissionClaim,
} = require('../../utils/missionStore');
const { refreshLiveScoreboard } = require('../../utils/liveScoreboard');

const HARD_WEEKLY_MISSIONS = [
	{
		title: 'Crowned Gauntlet',
		description: 'As one district squad, win 3 consecutive Ranked Battle Royale matches with at least 15 team eliminations in every match. Submit one proof collage.',
	},
	{
		title: 'Flawless District Victory',
		description: 'Win a Ranked Battle Royale with all 4 district squad members alive, at least 25 team eliminations, and no player rebooted. Submit proof showing the final result.',
	},
	{
		title: 'Underdog Arsenal',
		description: 'Win a Ranked Battle Royale using only Common and Uncommon weapons while earning at least 20 team eliminations. Submit a proof collage showing loadouts and the victory.',
	},
];

const data = new SlashCommandBuilder()
	.setName('mission-admin')
	.setDescription('Create and moderate weekly district missions.')
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.addSubcommand(subcommand =>
		subcommand
			.setName('generate')
			.setDescription('Publish the three extremely difficult preset missions for this week.')
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('create')
			.setDescription('Create a custom 20-point mission for the current week.')
			.addStringOption(option =>
				option.setName('title').setDescription('Mission title.').setMaxLength(100).setRequired(true)
			)
			.addStringOption(option =>
				option.setName('description').setDescription('Extremely difficult objective.').setMaxLength(1500).setRequired(true)
			)
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('review')
			.setDescription('List pending claims or inspect one proof submission.')
			.addStringOption(option =>
				option.setName('claim-id').setDescription('Optional claim ID to inspect.')
			)
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('approve')
			.setDescription('Approve a mission claim and award 20 district points.')
			.addStringOption(option =>
				option.setName('claim-id').setDescription('Claim ID.').setRequired(true)
			)
			.addStringOption(option =>
				option.setName('note').setDescription('Optional staff note.').setMaxLength(500)
			)
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('reject')
			.setDescription('Reject mission proof without awarding points.')
			.addStringOption(option =>
				option.setName('claim-id').setDescription('Claim ID.').setRequired(true)
			)
			.addStringOption(option =>
				option.setName('reason').setDescription('Reason for rejection.').setMaxLength(500).setRequired(true)
			)
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('remove')
			.setDescription('Remove a mission completion and subtract its 20 points.')
			.addStringOption(option =>
				option.setName('claim-id').setDescription('Claim ID.').setRequired(true)
			)
			.addStringOption(option =>
				option.setName('reason').setDescription('Reason for removal.').setMaxLength(500).setRequired(true)
			)
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('logs')
			.setDescription('View recent mission moderation actions.')
	);

async function safeRefresh(guild) {
	await refreshLiveScoreboard(guild).catch(error => {
		console.error('Mission scoreboard refresh failed:', error);
	});
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

			if (subcommand === 'generate') {
				const created = [];

				for (const mission of HARD_WEEKLY_MISSIONS) {
					try {
						created.push(await createMission(
							interaction.guildId,
							mission.title,
							mission.description,
							interaction.user.id
						));
					} catch (error) {
						if (error.code !== '23505') throw error;
					}
				}

				await interaction.reply({
					content: created.length
						? `Published ${created.length} extremely difficult missions for ${getWeekKey()}.`
						: 'This week’s preset missions have already been published.',
					ephemeral: true,
				});
				return;
			}

			if (subcommand === 'create') {
				const mission = await createMission(
					interaction.guildId,
					interaction.options.getString('title'),
					interaction.options.getString('description'),
					interaction.user.id
				);
				await interaction.reply({
					content: `Created mission #${mission.id} for ${mission.week_key}. It is worth 20 points per district.`,
					ephemeral: true,
				});
				return;
			}

			if (subcommand === 'review') {
				const claimId = interaction.options.getString('claim-id');

				if (!claimId) {
					const claims = await getPendingMissionClaims(interaction.guildId);
					const description = claims.length
						? claims.map(claim =>
							`**Claim #${claim.id} · Mission #${claim.mission_id}**\n` +
							`${claim.title} · <@&${claim.district_role_id}> · submitted by <@${claim.user_id}>`
						).join('\n\n')
						: 'There are no pending mission claims.';
					await interaction.reply({
						embeds: [new EmbedBuilder().setTitle('Pending mission claims').setDescription(description)],
						ephemeral: true,
					});
					return;
				}

				const claim = await getMissionClaim(interaction.guildId, claimId);

				if (!claim) {
					await interaction.reply({ content: 'Mission claim not found.', ephemeral: true });
					return;
				}

				const extension = claim.proof_mime === 'image/png'
					? 'png'
					: claim.proof_mime === 'image/webp' ? 'webp' : 'jpg';
				const embed = new EmbedBuilder()
					.setColor(0x9b59b6)
					.setTitle(`Mission claim #${claim.id}`)
					.setDescription(`**${claim.title}**\n${claim.description}`)
					.addFields(
						{ name: 'District', value: `<@&${claim.district_role_id}>`, inline: true },
						{ name: 'Submitted by', value: `<@${claim.user_id}>`, inline: true },
						{ name: 'Status', value: claim.status, inline: true },
						{ name: 'Member note', value: claim.note || 'None' }
					);
				await interaction.reply({
					embeds: [embed],
					files: [new AttachmentBuilder(claim.proof_data, { name: `mission-claim-${claim.id}.${extension}` })],
					ephemeral: true,
				});
				return;
			}

			if (['approve', 'reject', 'remove'].includes(subcommand)) {
				const claimId = interaction.options.getString('claim-id');
				const note = subcommand === 'approve'
					? interaction.options.getString('note')
					: interaction.options.getString('reason');
				const status = subcommand === 'approve' ? 'approved' : subcommand === 'reject' ? 'rejected' : 'removed';
				const claim = await moderateMissionClaim(
					interaction.guildId,
					claimId,
					interaction.user.id,
					status,
					note
				);
				await safeRefresh(interaction.guild);
				await interaction.reply({
					content: claim
						? `Mission claim #${claimId} ${status}.${status === 'approved' ? ' The district received 20 points.' : ''}`
						: 'Mission claim not found or already removed.',
					ephemeral: true,
				});
				return;
			}

			const logs = await getMissionLogs(interaction.guildId);
			const description = logs.length
				? logs.map(log =>
					`**${log.action}** claim #${log.claim_id || 'n/a'} by <@${log.actor_id}>\n` +
					`<t:${Math.floor(new Date(log.created_at).getTime() / 1000)}:R>`
				).join('\n\n')
				: 'No mission moderation actions have been logged.';
			await interaction.reply({
				embeds: [new EmbedBuilder().setTitle('Mission moderation log').setDescription(description)],
				ephemeral: true,
			});
		} catch (error) {
			console.error('Mission admin error:', error);
			await interaction.reply({
				content: error.code === '23505'
					? 'A mission with that title already exists this week.'
					: 'The mission action failed.',
				ephemeral: true,
			}).catch(() => {});
		}
	},
};
