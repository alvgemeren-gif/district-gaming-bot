const {
	ActionRowBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
	StringSelectMenuBuilder,
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
	.setDescription('Kies een permanente rol of beheer de vijf beschikbare rollen.')
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
			.setName('kiezen')
			.setDescription('Kies eenmalig één van de vijf rollen.')
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

			if (subcommand === 'kiezen') {
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

				if (!roleIds) {
					await interaction.reply({
						content: 'Een beheerder moet eerst vijf rollen instellen.',
						ephemeral: true,
					});
					return;
				}

				const roles = [];

				for (const roleId of roleIds) {
					const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
					if (role) roles.push(role);
				}

				if (roles.length !== 5) {
					await interaction.reply({
						content: 'Een of meer keuzerollen bestaan niet meer. Vraag een beheerder om dit te herstellen.',
						ephemeral: true,
					});
					return;
				}

				const menu = new StringSelectMenuBuilder()
					.setCustomId('rollen:kies')
					.setPlaceholder('Kies je definitieve rol')
					.addOptions(roles.map(role => ({
						label: role.name.slice(0, 100),
						value: role.id,
						description: 'Deze keuze kan alleen door een beheerder worden gereset.',
					})));

				await interaction.reply({
					content: 'Kies zorgvuldig: je kunt deze rol hierna niet zelf wijzigen.',
					components: [new ActionRowBuilder().addComponents(menu)],
					ephemeral: true,
				});
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

	async handleSelectMenu(interaction) {
		try {
			const selectedRoleId = interaction.values[0];
			const roleIds = await getRoleConfig(interaction.guildId);

			if (!roleIds?.includes(selectedRoleId)) {
				await interaction.update({
					content: 'Deze rol is niet beschikbaar.',
					components: [],
				});
				return;
			}

			const role = await interaction.guild.roles.fetch(selectedRoleId).catch(() => null);

			if (!role) {
				await interaction.update({ content: 'Deze rol bestaat niet meer.', components: [] });
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
				await interaction.update({
					content: `Jouw definitief gekozen rol is <@&${result.choice.role_id}>.`,
					components: [],
				});
				return;
			}

			try {
				const member = await interaction.guild.members.fetch(interaction.user.id);
				await member.roles.add(role);
			} catch {
				await rollbackClaim(interaction.guildId, interaction.user.id, selectedRoleId);
				await interaction.update({
					content: 'Ik kon de rol niet toewijzen. Vraag een beheerder om mijn botrol hoger te zetten.',
					components: [],
				});
				return;
			}

			await interaction.update({
				content: `Je definitieve keuze is ${role}. Alleen een beheerder kan dit resetten.`,
				components: [],
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
