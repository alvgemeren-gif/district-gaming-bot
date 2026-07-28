const {
	ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
	PermissionFlagsBits, SlashCommandBuilder,
} = require('discord.js');
const { addXp } = require('../../utils/levelSystem');
const { getRoleChoice, getRoleConfig } = require('../../utils/roleChoiceStore');
const { refreshLiveScoreboard } = require('../../utils/liveScoreboard');
const {
	claimDrop, createDrop, expireTemporaryRole, setDropMessage,
} = require('../../utils/supplyDropStore');

const RARITIES = {
	common: { label: 'Common', color: 0x95a5a6, emoji: '📦', xp: 100, points: 5, minutes: 30, keys: 25 },
	rare: { label: 'Rare', color: 0x3498db, emoji: '💧', xp: 250, points: 12, minutes: 60, keys: 50 },
	epic: { label: 'Epic', color: 0x9b59b6, emoji: '🔮', xp: 500, points: 25, minutes: 180, keys: 100 },
	legendary: { label: 'Legendary', color: 0xf1c40f, emoji: '👑', xp: 1000, points: 50, minutes: 360, keys: 175 },
	mythic: { label: 'Mythic', color: 0xe67e22, emoji: '🔥', xp: 2000, points: 100, minutes: 720, keys: 300 },
};

function rewardEmbed(rarity, rewardType, role) {
	const reward = RARITIES[rarity];
	const embed = new EmbedBuilder()
		.setColor(reward.color)
		.setTitle(`${reward.emoji} ${reward.label} Supply Drop`)
		.setDescription('De eerste speler die claimt, wint de inhoud voor het district!')
		.setFooter({ text: 'Snel! Deze supply drop kan maar één keer worden geclaimd.' });
	if (rewardType === 'keys') {
		return embed.addFields({
			name: '🔑 Vaultsleutels',
			value: `**+${reward.keys} sleutels** voor de gezamenlijke districtvoorraad`,
		});
	}
	return embed.addFields(
			{ name: 'XP', value: `+${reward.xp.toLocaleString('nl-NL')} XP`, inline: true },
			{ name: 'District Battle', value: `+${reward.points} punten`, inline: true },
			{ name: 'Tijdelijke rol', value: `${role} voor ${reward.minutes} minuten` },
		);
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('supply-drop')
		.setDescription('Spawn een supply drop met beloningen.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addStringOption(option => option.setName('type')
			.setDescription('Kies de inhoud van de supply drop.').setRequired(true)
			.addChoices(
				{ name: 'XP, districtpunten en tijdelijke rol', value: 'rewards' },
				{ name: 'Vaultsleutels', value: 'keys' },
			))
		.addStringOption(option => option.setName('rarity')
			.setDescription('De zeldzaamheid bepaalt de beloningen.').setRequired(true)
			.addChoices(...Object.entries(RARITIES).map(([value, item]) => ({ name: item.label, value }))))
		.addRoleOption(option => option.setName('tijdelijke-rol')
			.setDescription('Verplicht bij het normale beloningstype.')),

	async execute(interaction) {
		const rewardType = interaction.options.getString('type', true);
		const rarity = interaction.options.getString('rarity', true);
		const role = interaction.options.getRole('tijdelijke-rol');
		const reward = RARITIES[rarity];
		const botMember = interaction.guild.members.me;
		if (rewardType === 'rewards' && !role) {
			await interaction.reply({ content: 'Kies een tijdelijke rol voor dit beloningstype.', ephemeral: true });
			return;
		}
		if (role && (role.managed || role.id === interaction.guildId || role.position >= botMember.roles.highest.position)) {
			await interaction.reply({ content: 'Kies een niet-beheerde rol onder de hoogste botrol.', ephemeral: true });
			return;
		}

		await interaction.deferReply({ ephemeral: true });
		const drop = await createDrop({
			guildId: interaction.guildId, channelId: interaction.channelId, rarity,
			xp: reward.xp, points: reward.points, roleId: role?.id || interaction.guildId,
			durationMinutes: reward.minutes, createdBy: interaction.user.id,
			rewardType, keys: rewardType === 'keys' ? reward.keys : 0,
		});
		const message = await interaction.channel.send({
			embeds: [rewardEmbed(rarity, rewardType, role)],
			components: [new ActionRowBuilder().addComponents(
				new ButtonBuilder().setCustomId(`supply-drop:claim:${drop.id}`)
					.setLabel('Claim supply drop').setEmoji(reward.emoji).setStyle(ButtonStyle.Success)
			)],
		});
		await setDropMessage(drop.id, message.id);
		await interaction.editReply(`De ${reward.label} supply drop is geplaatst.`);
	},

	async handleButton(interaction) {
		const [, action, dropId] = interaction.customId.split(':');
		if (action !== 'claim' || !/^[0-9]+$/.test(dropId)) return;
		await interaction.deferReply({ ephemeral: true });

		const districtRoles = await getRoleConfig(interaction.guildId);
		const choice = await getRoleChoice(interaction.guildId, interaction.user.id);
		if (!choice || !districtRoles?.includes(choice.role_id)) {
			await interaction.editReply('Je moet eerst een geldige districtrol kiezen.');
			return;
		}
		const drop = await claimDrop(dropId, interaction.guildId, interaction.user.id, choice.role_id);
		if (!drop) {
			await interaction.editReply('Deze supply drop is al door iemand anders geclaimd.');
			return;
		}

		const member = await interaction.guild.members.fetch(interaction.user.id);
		const reward = RARITIES[drop.rarity];
		let role = null;
		let levelText = '';
		if (drop.reward_type === 'rewards') {
			role = await interaction.guild.roles.fetch(drop.role_id).catch(() => null);
			const xpResult = await addXp(interaction.guild, interaction.user.id, drop.xp);
			levelText = xpResult.level > xpResult.previousLevel ? ` Je bent level ${xpResult.level} geworden!` : '';
		}
		if (drop.reward_type === 'rewards' && role) {
			await member.roles.add(role, `Supply drop #${drop.id}`);
			const delay = Math.max(0, new Date(drop.role_expires_at).getTime() - Date.now()) + 1000;
			setTimeout(async () => {
				const expired = await expireTemporaryRole(drop.id).catch(error => {
					console.error('Could not expire supply drop role:', error);
					return null;
				});
				if (expired?.shouldRemove) {
					await member.roles.remove(role, `Supply drop #${drop.id} verlopen`).catch(console.error);
				}
			}, delay);
		}
		await interaction.message.edit({
			embeds: [rewardEmbed(
				drop.rarity,
				drop.reward_type,
				role || (drop.reward_type === 'rewards' ? `<@&${drop.role_id}>` : null)
			)
				.setDescription(`Geclaimd door ${interaction.user} voor <@&${choice.role_id}>!`)],
			components: [new ActionRowBuilder().addComponents(
				new ButtonBuilder().setCustomId(`supply-drop:claimed:${drop.id}`)
					.setLabel('Geclaimd').setStyle(ButtonStyle.Secondary).setDisabled(true)
			)],
		});
		if (drop.reward_type === 'keys') {
			await interaction.editReply(
				`Je hebt **${drop.keys} vaultsleutels** toegevoegd aan de voorraad van <@&${choice.role_id}>. Gebruik \`/vault status\` om de voortgang te bekijken.`
			);
		} else {
			await refreshLiveScoreboard(interaction.guild).catch(console.error);
			await interaction.editReply(
				`Gewonnen: **+${drop.xp} XP**, **+${drop.district_points} districtpunten** en ${role || 'de tijdelijke rol'} voor **${drop.role_duration_minutes} minuten**.${levelText}`
			);
		}
	},
	RARITIES,
};
