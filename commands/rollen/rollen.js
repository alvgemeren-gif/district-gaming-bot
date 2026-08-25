const {
	ActionRowBuilder,
	EmbedBuilder,
	RoleSelectMenuBuilder,
	SlashCommandBuilder,
	StringSelectMenuBuilder,
} = require('discord.js');
const { getRoleConfig, setRoleConfig } = require('../../utils/roleChoiceStore');

const COMMAND_NAME = 'choice-roles';
const SETUP_CUSTOM_ID = `${COMMAND_NAME}:setup`;
const CHOOSE_CUSTOM_ID = `${COMMAND_NAME}:choose`;

const data = new SlashCommandBuilder()
	.setName(COMMAND_NAME)
	.setDescription('Create a menu that lets members choose their own roles.')
	.setDefaultMemberPermissions(0)
	.addStringOption(option =>
		option
			.setName('text')
			.setDescription('Optional text displayed above the role menu.')
			.setMaxLength(3800)
	);

function databaseErrorResponse(error) {
	console.error('Choice roles database error:', error);
	return {
		content: 'The role database is unavailable. Check `DATABASE_URL`.',
		ephemeral: true,
	};
}

function buildMemberMenu(roles) {
	return new StringSelectMenuBuilder()
		.setCustomId(CHOOSE_CUSTOM_ID)
		.setPlaceholder('Select your roles')
		.setMinValues(0)
		.setMaxValues(roles.length)
		.addOptions(roles.map(role => ({
			label: role.name.slice(0, 100),
			value: role.id,
		})));
}

async function manageableRoles(interaction, roleIds) {
	const botMember = await interaction.guild.members.fetchMe();
	const roles = roleIds
		.map(roleId => interaction.guild.roles.cache.get(roleId))
		.filter(Boolean);
	const invalidRole = roles.find(role =>
		role.managed
			|| role.id === interaction.guildId
			|| role.position >= botMember.roles.highest.position
	);

	return { roles, invalidRole };
}

module.exports = {
	data,

	async execute(interaction) {
		if (interaction.user.id !== interaction.guild.ownerId) {
			await interaction.reply({
				content: 'Only the server owner can use this command.',
				ephemeral: true,
			});
			return;
		}

		const description = interaction.options.getString('text')
			|| 'Select the roles you want below. You can change your selection at any time.';

		await interaction.reply({
			content: 'Select every role that should be available in the menu (up to 25):',
			components: [
				new ActionRowBuilder().addComponents(
					new RoleSelectMenuBuilder()
						.setCustomId(`${SETUP_CUSTOM_ID}:${interaction.user.id}`)
						.setPlaceholder('Choose the available roles')
						.setMinValues(1)
						.setMaxValues(25),
				),
			],
			ephemeral: true,
		});

		interaction.client.choiceRoleTexts ??= new Map();
		interaction.client.choiceRoleTexts.set(
			`${interaction.guildId}:${interaction.user.id}`,
			description,
		);
	},

	async handleSelectMenu(interaction) {
		if (interaction.customId.startsWith(`${SETUP_CUSTOM_ID}:`)) {
			const ownerId = interaction.customId.split(':')[2];
			if (interaction.user.id !== ownerId
				|| interaction.user.id !== interaction.guild.ownerId) {
				await interaction.reply({ content: 'Only the server owner who opened this menu can configure it.', ephemeral: true });
				return;
			}

			try {
				const { roles, invalidRole } = await manageableRoles(interaction, interaction.values);
				if (roles.length !== interaction.values.length) {
					await interaction.reply({ content: 'One of the selected roles no longer exists.', ephemeral: true });
					return;
				}
				if (invalidRole) {
					await interaction.reply({
						content: `I cannot manage ${invalidRole}. Move my bot role higher and try again.`,
						ephemeral: true,
					});
					return;
				}

				await setRoleConfig(interaction.guildId, roles.map(role => role.id));
				const textKey = `${interaction.guildId}:${interaction.user.id}`;
				const description = interaction.client.choiceRoleTexts?.get(textKey)
					|| 'Select the roles you want below. You can change your selection at any time.';
				interaction.client.choiceRoleTexts?.delete(textKey);

				await interaction.channel.send({
					embeds: [new EmbedBuilder()
						.setColor(0x5865f2)
						.setTitle('Choice Roles')
						.setDescription(description)],
					components: [new ActionRowBuilder().addComponents(buildMemberMenu(roles))],
				});
				await interaction.update({
					content: `The choice-role menu was posted with ${roles.length} role(s): ${roles.join(', ')}`,
					components: [],
				});
			} catch (error) {
				const response = databaseErrorResponse(error);
				if (interaction.replied || interaction.deferred) await interaction.followUp(response);
				else await interaction.reply(response);
			}
			return;
		}

		if (interaction.customId !== CHOOSE_CUSTOM_ID) return;

		try {
			const configuredRoleIds = await getRoleConfig(interaction.guildId);
			if (!configuredRoleIds?.length) {
				await interaction.reply({ content: 'This choice-role menu is no longer active.', ephemeral: true });
				return;
			}

			const selectedRoleIds = interaction.values.filter(roleId => configuredRoleIds.includes(roleId));
			const member = await interaction.guild.members.fetch(interaction.user.id);
			const toAdd = selectedRoleIds.filter(roleId => !member.roles.cache.has(roleId));
			const toRemove = configuredRoleIds.filter(roleId =>
				member.roles.cache.has(roleId) && !selectedRoleIds.includes(roleId)
			);

			if (toAdd.length) await member.roles.add(toAdd, 'Choice roles updated');
			if (toRemove.length) await member.roles.remove(toRemove, 'Choice roles updated');
			await interaction.reply({
				content: selectedRoleIds.length
					? `Your roles were updated: ${selectedRoleIds.map(id => `<@&${id}>`).join(', ')}`
					: 'All your choice roles were removed.',
				ephemeral: true,
			});
		} catch (error) {
			console.error('Could not update choice roles:', error);
			await interaction.reply({
				content: 'I could not update your roles. Make sure my bot role is high enough.',
				ephemeral: true,
			}).catch(() => {});
		}
	},
};
