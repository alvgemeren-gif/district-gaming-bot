const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const {
	addInviteReward,
	deleteInviteReward,
	getInviteRewards,
	syncInviteRoles,
} = require('../../utils/inviteSystem');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('invites-admin')
		.setDescription('Manage role rewards for active invites.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand(subcommand =>
			subcommand
				.setName('reward-add')
				.setDescription('Award a role at a specified number of active invites.')
				.addIntegerOption(option =>
					option.setName('count').setDescription('The required number of active invites.').setMinValue(1).setMaxValue(100000).setRequired(true)
				)
				.addRoleOption(option =>
					option.setName('role').setDescription('The role that will be awarded automatically.').setRequired(true)
				)
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('reward-remove')
				.setDescription('Remove an invite role reward.')
				.addIntegerOption(option =>
					option.setName('count').setDescription('The invite threshold.').setMinValue(1).setMaxValue(100000).setRequired(true)
				)
				.addRoleOption(option =>
					option.setName('role').setDescription('Leave empty to remove every role at this threshold.')
				)
		),

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();
		const count = interaction.options.getInteger('count');
		const role = interaction.options.getRole('role');

		if (subcommand === 'reward-add') {
			const botMember = await interaction.guild.members.fetchMe();

			if (role.managed || role.id === interaction.guildId || role.position >= botMember.roles.highest.position) {
				await interaction.reply({
					content: 'I cannot award this role. Choose a regular role below my highest bot role.',
					ephemeral: true,
				});
				return;
			}

			addInviteReward(interaction.guildId, count, role.id);
			await interaction.deferReply({ ephemeral: true });
			for (const member of interaction.guild.members.cache.values()) {
				await syncInviteRoles(interaction.guild, member.id);
			}
			await interaction.editReply(`${role} will be awarded automatically at **${count}** active invite${count === 1 ? '' : 's'}.`);
			return;
		}

		const removedRoleIds = role
			? [role.id]
			: [...(getInviteRewards(interaction.guildId)[count] || [])];
		deleteInviteReward(interaction.guildId, count, role?.id || null);
		const remainingRoleIds = new Set(Object.values(getInviteRewards(interaction.guildId)).flat());
		const obsoleteRoleIds = removedRoleIds.filter(roleId => !remainingRoleIds.has(roleId));

		await interaction.deferReply({ ephemeral: true });
		if (obsoleteRoleIds.length) {
			for (const member of interaction.guild.members.cache.values()) {
				const assignedRoleIds = obsoleteRoleIds.filter(roleId => member.roles.cache.has(roleId));
				if (assignedRoleIds.length) {
					await member.roles.remove(assignedRoleIds).catch(console.error);
				}
			}
		}
		await interaction.editReply({
			content: role
				? `${role} was removed as a reward at **${count}** invites.`
				: `All rewards at **${count}** invites were removed.`,
		});
	},
};
