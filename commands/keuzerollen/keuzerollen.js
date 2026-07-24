const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
} = require('discord.js');

const MAX_ROLES = 10;

const data = new SlashCommandBuilder()
	.setName('keuzerollen')
	.setDescription('Maak een panel waarop leden zelf rollen kunnen kiezen.')
	.addStringOption(option =>
		option
			.setName('titel')
			.setDescription('Titel van het rollenpanel.')
			.setRequired(true)
	)
	.addStringOption(option =>
		option
			.setName('beschrijving')
			.setDescription('Tekst die boven de rollen komt te staan.')
			.setRequired(true)
	)
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

for (let index = 1; index <= MAX_ROLES; index += 1) {
	data.addRoleOption(option =>
		option
			.setName(`rol${index}`)
			.setDescription(`Rol ${index} waar leden uit kunnen kiezen.`)
			.setRequired(index === 1)
	);
}

function createRoleButtons(roles) {
	const rows = [];

	for (let index = 0; index < roles.length; index += 5) {
		const row = new ActionRowBuilder();

		for (const role of roles.slice(index, index + 5)) {
			row.addComponents(
				new ButtonBuilder()
					.setCustomId(`keuzerollen:${role.id}`)
					.setLabel(role.name.slice(0, 80))
					.setStyle(ButtonStyle.Secondary)
			);
		}

		rows.push(row);
	}

	return rows;
}

module.exports = {
	data,

	async execute(interaction) {
		const roles = [];

		for (let index = 1; index <= MAX_ROLES; index += 1) {
			const role = interaction.options.getRole(`rol${index}`);

			if (role && !roles.some(existingRole => existingRole.id === role.id)) {
				roles.push(role);
			}
		}

		const botMember = await interaction.guild.members.fetchMe();
		const invalidRole = roles.find(role => role.position >= botMember.roles.highest.position);

		if (invalidRole) {
			await interaction.reply({
				content: `Ik kan ${invalidRole} niet beheren. Zet mijn hoogste rol boven deze rol in de serverinstellingen.`,
				ephemeral: true,
			});
			return;
		}

		const title = interaction.options.getString('titel');
		const description = interaction.options.getString('beschrijving');
		const roleList = roles.map(role => `- ${role}`).join('\n');

		const embed = new EmbedBuilder()
			.setColor(0x5865f2)
			.setTitle(title)
			.setDescription(`${description}\n\n${roleList}`)
			.setFooter({ text: 'Klik op een knop om een rol te krijgen of te verwijderen.' });

		await interaction.channel.send({
			embeds: [embed],
			components: createRoleButtons(roles),
		});

		await interaction.reply({
			content: 'Keuzerollen panel aangemaakt.',
			ephemeral: true,
		});
	},

	async handleButton(interaction) {
		const [, roleId] = interaction.customId.split(':');
		const role = await interaction.guild.roles.fetch(roleId).catch(() => null);

		if (!role) {
			await interaction.reply({
				content: 'Deze rol bestaat niet meer.',
				ephemeral: true,
			});
			return;
		}

		const member = await interaction.guild.members.fetch(interaction.user.id);
		const hasRole = member.roles.cache.has(role.id);

		if (hasRole) {
			await member.roles.remove(role);
			await interaction.reply({
				content: `${role} is verwijderd.`,
				ephemeral: true,
			});
			return;
		}

		await member.roles.add(role);
		await interaction.reply({
			content: `${role} is toegevoegd.`,
			ephemeral: true,
		});
	},
};
