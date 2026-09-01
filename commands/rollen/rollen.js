const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	PermissionFlagsBits,
	RoleSelectMenuBuilder,
	SlashCommandBuilder,
} = require('discord.js');
const {
	claimRole,
	getRoleChoice,
	getRoleConfig,
	resetRoleChoice,
	rollbackClaim,
	setRoleConfig,
} = require('../../utils/roleChoiceStore');

const COMMAND_NAME = 'choice-roles';
const SETUP_CUSTOM_ID = `${COMMAND_NAME}:setup`;
const CHOOSE_CUSTOM_ID = `${COMMAND_NAME}:choose`;

const data = new SlashCommandBuilder()
	.setName(COMMAND_NAME)
	.setDescription('Maak een menu waarin leden een vaste keuzerol kiezen.')
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.addStringOption(option =>
		option
			.setName('text')
			.setDescription('Optionele tekst boven het keuzemenu.')
			.setMaxLength(3800)
	)
	.addUserOption(option =>
		option
			.setName('reset-lid')
			.setDescription('Wis de vaste keuze van een lid in plaats van een menu te plaatsen.')
	);

function databaseErrorResponse(error) {
	console.error('Choice roles database error:', error);
	return {
		content: 'De rollendatabase is niet beschikbaar. Controleer `DATABASE_URL`.',
		ephemeral: true,
	};
}

function buildMemberComponents(roles) {
	const buttons = roles.map(role => new ButtonBuilder()
		.setCustomId(`${CHOOSE_CUSTOM_ID}:${role.id}`)
		.setLabel(role.name.slice(0, 80))
		.setStyle(ButtonStyle.Secondary));
	const rows = [];
	for (let index = 0; index < buttons.length; index += 5) {
		rows.push(new ActionRowBuilder().addComponents(buttons.slice(index, index + 5)));
	}
	return rows;
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
		if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({
				content: 'Alleen een serverbeheerder kan dit commando gebruiken.',
				ephemeral: true,
			});
			return;
		}

		const resetUser = interaction.options.getUser('reset-lid');
		if (resetUser) {
			try {
				const choice = await getRoleChoice(interaction.guildId, resetUser.id);
				if (!choice) {
					await interaction.reply({ content: `${resetUser} heeft nog geen vaste keuzerol.`, ephemeral: true });
					return;
				}
				const member = await interaction.guild.members.fetch(resetUser.id).catch(() => null);
				await resetRoleChoice(interaction.guildId, resetUser.id);
				let roleRemoved = true;
				if (member?.roles.cache.has(choice.role_id)) {
					roleRemoved = await member.roles
						.remove(choice.role_id, `Keuzerol gereset door ${interaction.user.tag}`)
						.then(() => true, () => false);
				}
				await interaction.reply({
					content: roleRemoved
						? `De vaste keuzerol van ${resetUser} is gewist. Het lid kan nu opnieuw kiezen.`
						: `De keuze van ${resetUser} is gewist, maar ik kon de oude Discord-rol niet verwijderen. Controleer mijn rolrechten.`,
					ephemeral: true,
				});
			} catch (error) {
				await interaction.reply(databaseErrorResponse(error));
			}
			return;
		}

		const description = interaction.options.getString('text')
			|| 'Kies hieronder één rol. Je keuze is permanent en kan alleen door een serverbeheerder worden gereset.';

		await interaction.reply({
			content: 'Selecteer alle rollen waaruit leden mogen kiezen (maximaal 25):',
			components: [
				new ActionRowBuilder().addComponents(
					new RoleSelectMenuBuilder()
						.setCustomId(`${SETUP_CUSTOM_ID}:${interaction.user.id}`)
						.setPlaceholder('Kies de beschikbare rollen')
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
				|| !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
				await interaction.reply({ content: 'Alleen de beheerder die dit menu opende kan het instellen.', ephemeral: true });
				return;
			}

			try {
				const { roles, invalidRole } = await manageableRoles(interaction, interaction.values);
				if (roles.length !== interaction.values.length) {
					await interaction.reply({ content: 'Een van de geselecteerde rollen bestaat niet meer.', ephemeral: true });
					return;
				}
				if (invalidRole) {
					await interaction.reply({
						content: `Ik kan ${invalidRole} niet beheren. Zet mijn botrol hoger en probeer opnieuw.`,
						ephemeral: true,
					});
					return;
				}

				await setRoleConfig(interaction.guildId, roles.map(role => role.id));
				const textKey = `${interaction.guildId}:${interaction.user.id}`;
				const description = interaction.client.choiceRoleTexts?.get(textKey)
					|| 'Kies hieronder één rol. Je keuze is permanent en kan alleen door een serverbeheerder worden gereset.';
				interaction.client.choiceRoleTexts?.delete(textKey);

				await interaction.channel.send({
					embeds: [new EmbedBuilder()
						.setColor(0x5865f2)
						.setTitle('Kies je rol')
						.setDescription(description)],
					components: buildMemberComponents(roles),
				});
				await interaction.update({
					content: `Het keuzerollenmenu is geplaatst met ${roles.length} rol${roles.length === 1 ? '' : 'len'}: ${roles.join(', ')}`,
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
		await this.assignChoice(interaction, interaction.values[0]);
	},

	async assignChoice(interaction, roleId) {
		try {
			const configuredRoleIds = await getRoleConfig(interaction.guildId);
			if (!configuredRoleIds?.length) {
				await interaction.reply({ content: 'Dit keuzerollenmenu is niet meer actief.', ephemeral: true });
				return;
			}

			if (!roleId || !configuredRoleIds.includes(roleId)) {
				await interaction.reply({ content: 'Deze rol is niet beschikbaar.', ephemeral: true });
				return;
			}

			const existingChoice = await getRoleChoice(interaction.guildId, interaction.user.id);
			if (existingChoice) {
				await interaction.reply({
					content: `Je hebt al een vaste keuzerol: <@&${existingChoice.role_id}>.`,
					ephemeral: true,
				});
				return;
			}

			const claim = await claimRole(interaction.guildId, interaction.user.id, roleId);
			if (!claim.created) {
				await interaction.reply({
					content: `Je hebt al een vaste keuzerol: <@&${claim.choice.role_id}>.`,
					ephemeral: true,
				});
				return;
			}

			const member = await interaction.guild.members.fetch(interaction.user.id);
			try {
				await member.roles.add(roleId, 'Vaste keuzerol gekozen');
				const oldRoleIds = configuredRoleIds.filter(id => id !== roleId && member.roles.cache.has(id));
				if (oldRoleIds.length) await member.roles.remove(oldRoleIds, 'Andere keuzerollen verwijderd');
			} catch (error) {
				await rollbackClaim(interaction.guildId, interaction.user.id, roleId).catch(console.error);
				throw error;
			}
			await interaction.reply({
				content: `Je vaste keuzerol is ingesteld op <@&${roleId}>.`,
				ephemeral: true,
			});
		} catch (error) {
			console.error('Could not update choice roles:', error);
			await interaction.reply({
				content: 'Ik kon je rol niet instellen. Controleer of mijn botrol hoog genoeg staat.',
				ephemeral: true,
			}).catch(() => {});
		}
	},

	async handleButton(interaction) {
		if (!interaction.customId.startsWith(`${CHOOSE_CUSTOM_ID}:`)) return;
		const roleId = interaction.customId.slice(`${CHOOSE_CUSTOM_ID}:`.length);
		await this.assignChoice(interaction, roleId);
	},

	buildMemberComponents,
};
