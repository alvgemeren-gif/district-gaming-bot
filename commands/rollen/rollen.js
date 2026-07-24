const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
} = require('discord.js');
const {
	claimRole,
	countChoices,
	getRoleChoice,
	getRoleConfig,
	resetRoleChoice,
	rollbackClaim,
	setRoleConfig,
} = require('../../utils/roleChoiceStore');

const data = new SlashCommandBuilder()
	.setName('roles')
	.setDescription('Manage the permanent role selection system.')
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.addSubcommand(subcommand => {
		subcommand
			.setName('configure')
			.setDescription('Configure the five available roles.');

		for (let index = 1; index <= 5; index += 1) {
			subcommand.addRoleOption(option =>
				option
					.setName(`role${index}`)
					.setDescription(`Available role ${index}.`)
					.setRequired(true)
			);
		}

		return subcommand;
	})
	.addSubcommand(subcommand =>
		subcommand
			.setName('panel')
			.setDescription('Post the role selection panel for members.')
			.addStringOption(option =>
				option
					.setName('description')
					.setDescription('Custom text above the roles. Use \\n for a new line.')
					.setMaxLength(3800)
					.setRequired(true)
			)
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('status')
			.setDescription('View a permanently selected role.')
			.addUserOption(option =>
				option
					.setName('user')
					.setDescription('User to view.')
			)
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('reset')
			.setDescription('Reset a member’s role selection.')
			.addUserOption(option =>
				option
					.setName('user')
					.setDescription('Member whose selection will be reset.')
					.setRequired(true)
			)
	);

function databaseErrorResponse(error) {
	console.error('Role choice database error:', error);
	return {
		content: 'The role database is unavailable. Check `DATABASE_URL` on Render.',
		ephemeral: true,
	};
}

async function ensureChosenRole(member, roleId) {
	if (!member.roles.cache.has(roleId)) {
		await member.roles.add(roleId).catch(() => {});
	}
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

		const subcommand = interaction.options.getSubcommand();

		try {
			if (subcommand === 'configure') {
				if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) {
					await interaction.reply({ content: 'You need the Manage Roles permission.', ephemeral: true });
					return;
				}

				const roles = Array.from({ length: 5 }, (_, index) =>
					interaction.options.getRole(`role${index + 1}`)
				);

				if (new Set(roles.map(role => role.id)).size !== 5) {
					await interaction.reply({ content: 'Select five different roles.', ephemeral: true });
					return;
				}

				const botMember = await interaction.guild.members.fetchMe();
				const invalidRole = roles.find(role => role.position >= botMember.roles.highest.position);

				if (invalidRole) {
					await interaction.reply({
						content: `I cannot manage ${invalidRole}. Move my bot role above all five selectable roles.`,
						ephemeral: true,
					});
					return;
				}

				const currentConfig = await getRoleConfig(interaction.guildId);
				const isChanged = currentConfig
					&& currentConfig.some((roleId, index) => roleId !== roles[index].id);

				if (isChanged && await countChoices(interaction.guildId) > 0) {
					await interaction.reply({
						content: 'The roles cannot be changed while permanent selections exist. Reset those members first.',
						ephemeral: true,
					});
					return;
				}

				await setRoleConfig(interaction.guildId, roles.map(role => role.id));
				await interaction.reply({
					content: `The five roles have been configured: ${roles.join(', ')}`,
					ephemeral: true,
				});
				return;
			}

			if (subcommand === 'panel') {
				const roleIds = await getRoleConfig(interaction.guildId);
				const description = interaction.options
					.getString('description')
					.replaceAll('\\n', '\n');

				if (!roleIds) {
					await interaction.reply({
						content: 'Configure the five roles first with `/roles configure`.',
						ephemeral: true,
					});
					return;
				}

				const embed = new EmbedBuilder()
					.setColor(0x5865f2)
					.setTitle('Choose your role')
					.setDescription(
						`${description}\n\nClick one role. Your first selection is permanent and can only be reset by an administrator.`
					);
				const roles = [];

				for (const roleId of roleIds) {
					const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
					if (role) roles.push(role);
				}

				if (roles.length !== 5) {
					await interaction.reply({
						content: 'One or more selectable roles no longer exist. Configure all five roles again.',
						ephemeral: true,
					});
					return;
				}

				const buttons = roles.map(role =>
					new ButtonBuilder()
						.setCustomId(`roles:choose:${role.id}`)
						.setLabel(role.name.slice(0, 80))
						.setStyle(ButtonStyle.Primary)
				);

				await interaction.channel.send({
					embeds: [embed],
					components: [new ActionRowBuilder().addComponents(buttons)],
				});
				await interaction.reply({ content: 'Role selection panel posted.', ephemeral: true });
				return;
			}

			if (subcommand === 'status') {
				const user = interaction.options.getUser('user') || interaction.user;
				const choice = await getRoleChoice(interaction.guildId, user.id);
				await interaction.reply({
					content: choice
						? `${user} permanently selected <@&${choice.role_id}>.`
						: `${user} has not selected a role yet.`,
					ephemeral: true,
				});
				return;
			}

			if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) {
				await interaction.reply({ content: 'You need the Manage Roles permission.', ephemeral: true });
				return;
			}

			const user = interaction.options.getUser('user');
			const choice = await getRoleChoice(interaction.guildId, user.id);

			if (!choice) {
				await interaction.reply({ content: `${user} has no saved selection.`, ephemeral: true });
				return;
			}

			const member = await interaction.guild.members.fetch(user.id).catch(() => null);

			if (member?.roles.cache.has(choice.role_id)) {
				try {
					await member.roles.remove(choice.role_id);
				} catch {
					await interaction.reply({
						content: 'The role could not be removed. Move my bot role higher and try again.',
						ephemeral: true,
					});
					return;
				}
			}

			await resetRoleChoice(interaction.guildId, user.id);
			await interaction.reply({
				content: `${user}'s permanent role selection has been reset.`,
				ephemeral: true,
			});
		} catch (error) {
			const response = databaseErrorResponse(error);
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp(response);
			} else {
				await interaction.reply(response);
			}
		}
	},

	async handleButton(interaction) {
		try {
			const [, action, selectedRoleId] = interaction.customId.split(':');

			if (action !== 'choose' || !selectedRoleId) {
				await interaction.reply({ content: 'This role button is outdated.', ephemeral: true });
				return;
			}

			const existing = await getRoleChoice(interaction.guildId, interaction.user.id);

			if (existing) {
				const member = await interaction.guild.members.fetch(interaction.user.id);
				await ensureChosenRole(member, existing.role_id);
				await interaction.reply({
					content: `Your permanently selected role is <@&${existing.role_id}>.`,
					ephemeral: true,
				});
				return;
			}

			const roleIds = await getRoleConfig(interaction.guildId);

			if (!roleIds?.includes(selectedRoleId)) {
				await interaction.reply({
					content: 'This role is no longer available.',
					ephemeral: true,
				});
				return;
			}

			const role = await interaction.guild.roles.fetch(selectedRoleId).catch(() => null);

			if (!role) {
				await interaction.reply({
					content: 'This role no longer exists.',
					ephemeral: true,
				});
				return;
			}

			const result = await claimRole(
				interaction.guildId,
				interaction.user.id,
				selectedRoleId
			);

			if (!result.created) {
				const member = await interaction.guild.members.fetch(interaction.user.id);
				await ensureChosenRole(member, result.choice.role_id);
				await interaction.reply({
					content: `Your permanently selected role is <@&${result.choice.role_id}>.`,
					ephemeral: true,
				});
				return;
			}

			try {
				const member = await interaction.guild.members.fetch(interaction.user.id);
				await member.roles.add(role);
			} catch {
				await rollbackClaim(interaction.guildId, interaction.user.id, selectedRoleId);
				await interaction.reply({
					content: 'I could not assign the role. Ask an administrator to move my bot role higher.',
					ephemeral: true,
				});
				return;
			}

			await interaction.reply({
				content: `Your permanent selection is ${role}. Only an administrator can reset it.`,
				ephemeral: true,
			});
		} catch (error) {
			console.error('Role selection error:', error);
			const response = databaseErrorResponse(error);
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp(response);
			} else {
				await interaction.reply(response);
			}
		}
	},
};
