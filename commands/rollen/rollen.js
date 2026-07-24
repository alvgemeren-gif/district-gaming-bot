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
	.setName('rollen')
	.setDescription('Beheer het permanente keuzerollensysteem.')
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.addSubcommand(subcommand => {
		subcommand
			.setName('instellen')
			.setDescription('Stel de vijf beschikbare rollen in.');

		for (let index = 1; index <= 5; index += 1) {
			subcommand.addRoleOption(option =>
				option
					.setName(`rol${index}`)
					.setDescription(`Beschikbare rol ${index}.`)
					.setRequired(true)
			);
		}

		return subcommand;
	})
	.addSubcommand(subcommand =>
		subcommand
			.setName('paneel')
			.setDescription('Plaats het rolkeuzepaneel voor spelers.')
			.addStringOption(option =>
				option
					.setName('beschrijving')
					.setDescription('Eigen tekst boven de keuzerollen. Gebruik \\n voor een nieuwe regel.')
					.setMaxLength(3800)
					.setRequired(true)
			)
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('status')
			.setDescription('Bekijk de definitief gekozen rol.')
			.addUserOption(option =>
				option
					.setName('gebruiker')
					.setDescription('Gebruiker om te bekijken.')
			)
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('reset')
			.setDescription('Reset als beheerder de keuze van een speler.')
			.addUserOption(option =>
				option
					.setName('gebruiker')
					.setDescription('Speler waarvan de keuze wordt gereset.')
					.setRequired(true)
			)
	);

function databaseErrorResponse(error) {
	console.error('Role choice database error:', error);
	return {
		content: 'De rollendatabase is niet beschikbaar. Controleer `DATABASE_URL` op Render.',
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
				content: 'Alleen een serverbeheerder kan dit command gebruiken.',
				ephemeral: true,
			});
			return;
		}

		const subcommand = interaction.options.getSubcommand();

		try {
			if (subcommand === 'instellen') {
				if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) {
					await interaction.reply({ content: 'Je hebt Rollen beheren nodig.', ephemeral: true });
					return;
				}

				const roles = Array.from({ length: 5 }, (_, index) =>
					interaction.options.getRole(`rol${index + 1}`)
				);

				if (new Set(roles.map(role => role.id)).size !== 5) {
					await interaction.reply({ content: 'Kies vijf verschillende rollen.', ephemeral: true });
					return;
				}

				const botMember = await interaction.guild.members.fetchMe();
				const invalidRole = roles.find(role => role.position >= botMember.roles.highest.position);

				if (invalidRole) {
					await interaction.reply({
						content: `Ik kan ${invalidRole} niet beheren. Zet mijn botrol boven alle vijf keuzerollen.`,
						ephemeral: true,
					});
					return;
				}

				const currentConfig = await getRoleConfig(interaction.guildId);
				const isChanged = currentConfig
					&& currentConfig.some((roleId, index) => roleId !== roles[index].id);

				if (isChanged && await countChoices(interaction.guildId) > 0) {
					await interaction.reply({
						content: 'De rollen kunnen niet worden gewijzigd zolang er permanente keuzes bestaan. Reset die spelers eerst.',
						ephemeral: true,
					});
					return;
				}

				await setRoleConfig(interaction.guildId, roles.map(role => role.id));
				await interaction.reply({
					content: `De vijf rollen zijn ingesteld: ${roles.join(', ')}`,
					ephemeral: true,
				});
				return;
			}

			if (subcommand === 'paneel') {
				const roleIds = await getRoleConfig(interaction.guildId);
				const description = interaction.options
					.getString('beschrijving')
					.replaceAll('\\n', '\n');

				if (!roleIds) {
					await interaction.reply({
						content: 'Stel eerst de vijf rollen in met `/rollen instellen`.',
						ephemeral: true,
					});
					return;
				}

				const embed = new EmbedBuilder()
					.setColor(0x5865f2)
					.setTitle('Keuzerollen')
					.setDescription(
						`${description}\n\nKlik op één rol. Je eerste keuze is permanent en kan daarna alleen door een beheerder worden gereset.`
					);
				const roles = [];

				for (const roleId of roleIds) {
					const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
					if (role) roles.push(role);
				}

				if (roles.length !== 5) {
					await interaction.reply({
						content: 'Een of meer keuzerollen bestaan niet meer. Stel de vijf rollen opnieuw in.',
						ephemeral: true,
					});
					return;
				}

				const buttons = roles.map(role =>
					new ButtonBuilder()
						.setCustomId(`rollen:kies:${role.id}`)
						.setLabel(role.name.slice(0, 80))
						.setStyle(ButtonStyle.Primary)
				);

				await interaction.channel.send({
					embeds: [embed],
					components: [new ActionRowBuilder().addComponents(buttons)],
				});
				await interaction.reply({ content: 'Keuzerollenpaneel geplaatst.', ephemeral: true });
				return;
			}

			if (subcommand === 'status') {
				const user = interaction.options.getUser('gebruiker') || interaction.user;
				const choice = await getRoleChoice(interaction.guildId, user.id);
				await interaction.reply({
					content: choice
						? `${user} heeft definitief gekozen voor <@&${choice.role_id}>.`
						: `${user} heeft nog geen rol gekozen.`,
					ephemeral: true,
				});
				return;
			}

			if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) {
				await interaction.reply({ content: 'Je hebt Rollen beheren nodig.', ephemeral: true });
				return;
			}

			const user = interaction.options.getUser('gebruiker');
			const choice = await getRoleChoice(interaction.guildId, user.id);

			if (!choice) {
				await interaction.reply({ content: `${user} heeft geen opgeslagen keuze.`, ephemeral: true });
				return;
			}

			const member = await interaction.guild.members.fetch(user.id).catch(() => null);

			if (member?.roles.cache.has(choice.role_id)) {
				try {
					await member.roles.remove(choice.role_id);
				} catch {
					await interaction.reply({
						content: 'De rol kon niet worden verwijderd. Zet mijn botrol hoger en probeer opnieuw.',
						ephemeral: true,
					});
					return;
				}
			}

			await resetRoleChoice(interaction.guildId, user.id);
			await interaction.reply({
				content: `De permanente rolkeuze van ${user} is gereset.`,
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

			if (action !== 'kies' || !selectedRoleId) {
				await interaction.reply({ content: 'Deze rolknop is verouderd.', ephemeral: true });
				return;
			}

			const existing = await getRoleChoice(interaction.guildId, interaction.user.id);

			if (existing) {
				const member = await interaction.guild.members.fetch(interaction.user.id);
				await ensureChosenRole(member, existing.role_id);
				await interaction.reply({
					content: `Jouw definitief gekozen rol is <@&${existing.role_id}>.`,
					ephemeral: true,
				});
				return;
			}

			const roleIds = await getRoleConfig(interaction.guildId);

			if (!roleIds?.includes(selectedRoleId)) {
				await interaction.reply({
					content: 'Deze rol is niet meer beschikbaar.',
					ephemeral: true,
				});
				return;
			}

			const role = await interaction.guild.roles.fetch(selectedRoleId).catch(() => null);

			if (!role) {
				await interaction.reply({
					content: 'Deze rol bestaat niet meer.',
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
					content: `Jouw definitief gekozen rol is <@&${result.choice.role_id}>.`,
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
					content: 'Ik kon de rol niet toewijzen. Vraag een beheerder om mijn botrol hoger te zetten.',
					ephemeral: true,
				});
				return;
			}

			await interaction.reply({
				content: `Je definitieve keuze is ${role}. Alleen een beheerder kan dit resetten.`,
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
