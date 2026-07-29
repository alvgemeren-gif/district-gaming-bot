const {
	ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, EmbedBuilder,
	PermissionFlagsBits, SlashCommandBuilder,
} = require('discord.js');
const { addXp } = require('../../utils/levelSystem');
const { getRoleChoice, getRoleConfig } = require('../../utils/roleChoiceStore');
const { refreshLiveScoreboard } = require('../../utils/liveScoreboard');
const {
	addDropMessage, claimDrop, countXpMessage, createDrop, disableAutomaticDrops,
	expireTemporaryRole, getDropMessages, setMessageDropConfig,
} = require('../../utils/supplyDropStore');
const pendingSetups = new Map();

const RARITIES = {
	common: { label: 'Common', color: 0x95a5a6, emoji: '📦', xp: 100, points: 5, minutes: 30, keys: 25, weight: 50 },
	rare: { label: 'Rare', color: 0x3498db, emoji: '💧', xp: 250, points: 12, minutes: 60, keys: 50, weight: 25 },
	epic: { label: 'Epic', color: 0x9b59b6, emoji: '🔮', xp: 500, points: 25, minutes: 180, keys: 100, weight: 15 },
	legendary: { label: 'Legendary', color: 0xf1c40f, emoji: '👑', xp: 1000, points: 50, minutes: 360, keys: 175, weight: 8 },
	mythic: { label: 'Mythic', color: 0xe67e22, emoji: '🔥', xp: 2000, points: 100, minutes: 720, keys: 300, weight: 2 },
};

const REWARD_TYPES = ['xp', 'points', 'keys', 'role'];

function randomRarity(random = Math.random) {
	let roll = random() * Object.values(RARITIES).reduce((sum, item) => sum + item.weight, 0);
	for (const [rarity, item] of Object.entries(RARITIES)) {
		roll -= item.weight;
		if (roll < 0) return rarity;
	}
	return 'common';
}

function randomRewardType(random = Math.random) {
	return REWARD_TYPES[Math.min(Math.floor(random() * REWARD_TYPES.length), REWARD_TYPES.length - 1)];
}

function rewardFields(reward, role, rewardType = null) {
	const fields = {
		xp: { name: 'XP', value: `+${reward.xp.toLocaleString('nl-NL')} XP`, inline: true },
		points: { name: 'District Battle', value: `+${reward.points} punten`, inline: true },
		keys: { name: 'Vault', value: `🔑 +${reward.keys} sleutels`, inline: true },
		role: { name: 'Tijdelijke rol', value: `${role} voor ${reward.minutes} minuten` },
	};
	return rewardType ? [fields[rewardType]] : REWARD_TYPES.map(type => fields[type]);
}

function rewardEmbed(rarity, role, rewardType = null) {
	const reward = RARITIES[rarity];
	return new EmbedBuilder()
		.setColor(reward.color)
		.setTitle(`${reward.emoji} ${reward.label} Supply Drop`)
		.setDescription(rewardType
			? 'De winnaar heeft deze beloning gekregen:'
			: 'De eerste speler die claimt, wint één willekeurige beloning!')
		.addFields(...rewardFields(reward, role, rewardType))
		.setFooter({ text: 'Snel! Deze supply drop kan maar één keer worden geclaimd.' });
}

async function postSupplyDrop(guild, channelIds, roleId, rarity, createdBy = 'automatic') {
	const role = await guild.roles.fetch(roleId).catch(() => null);
	if (!role) throw new Error('Configured supply drop role no longer exists.');
	const reward = RARITIES[rarity];
	const rewardType = randomRewardType();
	const drop = await createDrop({
		guildId: guild.id, channelId: channelIds[0], rarity, xp: reward.xp, points: reward.points,
		roleId, durationMinutes: reward.minutes, createdBy, rewardType, keys: reward.keys,
	});
	for (const channelId of channelIds) {
		const channel = await guild.channels.fetch(channelId).catch(() => null);
		if (!channel?.isTextBased()) continue;
		const message = await channel.send({
			embeds: [rewardEmbed(rarity, role)],
			components: [new ActionRowBuilder().addComponents(
				new ButtonBuilder().setCustomId(`supply-drop:claim:${drop.id}`)
					.setLabel('Claim supply drop').setEmoji(reward.emoji).setStyle(ButtonStyle.Success)
			)],
		});
		await addDropMessage(drop.id, channel.id, message.id);
	}
	return drop;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('supply-drop')
		.setDescription('Beheer automatische supply drops.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand(command => command.setName('setup')
			.setDescription('Stuur drops na een aantal XP-berichten.')
			.addRoleOption(option => option.setName('tijdelijke-rol').setDescription('Rol voor de winnaar.').setRequired(true))
			.addIntegerOption(option => option.setName('aantal-berichten')
				.setDescription('Aantal berichten dat XP moet krijgen; standaard 100.').setMinValue(1).setMaxValue(100000)))
		.addSubcommand(command => command.setName('nu')
			.setDescription('Plaats direct een extra supply drop.')
			.addStringOption(option => option.setName('rarity').setDescription('Rarity van deze extra drop.').setRequired(true)
				.addChoices(...Object.entries(RARITIES).map(([value, item]) => ({ name: item.label, value }))))
			.addChannelOption(option => option.setName('kanaal').setDescription('Kanaal voor deze drop.')
				.addChannelTypes(ChannelType.GuildText).setRequired(true))
			.addRoleOption(option => option.setName('tijdelijke-rol').setDescription('Rol voor de winnaar.').setRequired(true)))
		.addSubcommand(command => command.setName('uitschakelen')
			.setDescription('Stop de automatische supply drops.')),

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();
		if (subcommand === 'uitschakelen') {
			const disabled = await disableAutomaticDrops(interaction.guildId);
			await interaction.reply({ content: disabled ? 'Automatische supply drops zijn uitgeschakeld.' : 'Er was nog geen automatische configuratie.', ephemeral: true });
			return;
		}
		const role = interaction.options.getRole('tijdelijke-rol', true);
		const botMember = interaction.guild.members.me;
		if (role.managed || role.id === interaction.guildId || role.position >= botMember.roles.highest.position) {
			await interaction.reply({ content: 'Kies een niet-beheerde rol onder de hoogste botrol.', ephemeral: true });
			return;
		}
		await interaction.deferReply({ ephemeral: true });
		if (subcommand === 'setup') {
			const count = interaction.options.getInteger('aantal-berichten') || 100;
			pendingSetups.set(interaction.user.id, { guildId: interaction.guildId, roleId: role.id, count });
			await interaction.editReply({
				content: 'Selecteer alle tekstkanalen waarin berichten meetellen én de supply drop wordt geplaatst:',
				components: [new ActionRowBuilder().addComponents(
					new ChannelSelectMenuBuilder().setCustomId(`supply-drop:setup:${interaction.user.id}`)
						.setChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(25)
				)],
			});
			return;
		}
		const channel = interaction.options.getChannel('kanaal', true);
		const rarity = interaction.options.getString('rarity', true);
		await postSupplyDrop(interaction.guild, [channel.id], role.id, rarity, interaction.user.id);
		await interaction.editReply(`De ${RARITIES[rarity].label} supply drop is geplaatst in ${channel}.`);
	},

	async handleSelectMenu(interaction) {
		const [, action, userId] = interaction.customId.split(':');
		if (action !== 'setup' || userId !== interaction.user.id) return;
		const pending = pendingSetups.get(userId);
		if (!pending || pending.guildId !== interaction.guildId) {
			await interaction.reply({ content: 'Deze setup is verlopen. Gebruik `/supply-drop setup` opnieuw.', ephemeral: true });
			return;
		}
		await setMessageDropConfig(interaction.guildId, interaction.values, pending.roleId, pending.count);
		pendingSetups.delete(userId);
		await interaction.update({
			content: `Automatische drops staan aan na elke **${pending.count} XP-berichten** (${pending.count * 15} verdiende bericht-XP), in ${interaction.values.map(id => `<#${id}>`).join(', ')}.`,
			components: [],
		});
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
		const role = await interaction.guild.roles.fetch(drop.role_id).catch(() => null);
		const xpResult = drop.reward_type === 'xp'
			? await addXp(interaction.guild, interaction.user.id, drop.xp)
			: null;
		if (drop.reward_type === 'role' && role && role.id !== interaction.guildId && !role.managed) {
			await member.roles.add(role, `Supply drop #${drop.id}`);
			const delay = Math.max(0, new Date(drop.role_expires_at).getTime() - Date.now()) + 1000;
			setTimeout(async () => {
				const expired = await expireTemporaryRole(drop.id).catch(() => null);
				if (expired?.shouldRemove) await member.roles.remove(role, `Supply drop #${drop.id} verlopen`).catch(console.error);
			}, delay);
		}
		const claimedPayload = {
			embeds: [rewardEmbed(drop.rarity, role || `<@&${drop.role_id}>`, drop.reward_type)
				.setDescription(`Geclaimd door ${interaction.user} voor <@&${choice.role_id}>!`)],
			components: [new ActionRowBuilder().addComponents(
				new ButtonBuilder().setCustomId(`supply-drop:claimed:${drop.id}`)
					.setLabel('Geclaimd').setStyle(ButtonStyle.Secondary).setDisabled(true)
			)],
		};
		for (const copy of await getDropMessages(drop.id)) {
			const channel = await interaction.guild.channels.fetch(copy.channel_id).catch(() => null);
			const message = await channel?.messages.fetch(copy.message_id).catch(() => null);
			if (message) await message.edit(claimedPayload).catch(console.error);
		}
		await refreshLiveScoreboard(interaction.guild).catch(console.error);
		const levelText = xpResult?.level > xpResult?.previousLevel ? ` Je bent level ${xpResult.level} geworden!` : '';
		const won = {
			xp: `**+${drop.xp} XP**${levelText}`,
			points: `**+${drop.district_points} districtpunten**`,
			keys: `**+${drop.keys} vaultsleutels**`,
			role: `${role || 'de tijdelijke rol'} voor **${drop.role_duration_minutes} minuten**`,
		};
		await interaction.editReply(`Je hebt ${won[drop.reward_type]} gewonnen!`);
	},

	async handleXpMessage(message) {
		const config = await countXpMessage(message.guild.id, message.channel.id);
		if (config) {
			await postSupplyDrop(message.guild, config.channel_ids, config.role_id, randomRarity());
		}
	},

	RARITIES,
	REWARD_TYPES,
	randomRarity,
	randomRewardType,
};
