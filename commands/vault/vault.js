const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { getRoleChoice, getRoleConfig } = require('../../utils/roleChoiceStore');
const { refreshLiveScoreboard } = require('../../utils/liveScoreboard');
const { getKeyBalance, openVault } = require('../../utils/supplyDropStore');

const KEYS_REQUIRED = 500;
const VAULT_POINTS = 250;

async function getDistrict(interaction) {
	const roles = await getRoleConfig(interaction.guildId);
	const choice = await getRoleChoice(interaction.guildId, interaction.user.id);
	return choice && roles?.includes(choice.role_id) ? choice.role_id : null;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('vault')
		.setDescription('Bekijk of open de vault van je district.')
		.addSubcommand(command => command.setName('status')
			.setDescription('Bekijk hoeveel sleutels je district heeft.'))
		.addSubcommand(command => command.setName('open')
			.setDescription(`Gebruik ${KEYS_REQUIRED} sleutels voor scoreboardpunten.`)),

	async execute(interaction) {
		const districtRoleId = await getDistrict(interaction);
		if (!districtRoleId) {
			await interaction.reply({ content: 'Je moet eerst een geldige districtrol kiezen.', ephemeral: true });
			return;
		}

		await interaction.deferReply();
		if (interaction.options.getSubcommand() === 'status') {
			const keys = await getKeyBalance(interaction.guildId, districtRoleId);
			const percentage = Math.min(100, Math.floor((keys / KEYS_REQUIRED) * 100));
			const filled = Math.round(percentage / 10);
			await interaction.editReply({
				embeds: [new EmbedBuilder()
					.setColor(keys >= KEYS_REQUIRED ? 0xf1c40f : 0x5865f2)
					.setTitle('🔐 District Vault')
					.setDescription(
						`${interaction.member} · <@&${districtRoleId}>\n\n` +
						`🔑 **${keys} / ${KEYS_REQUIRED} sleutels**\n` +
						`\`${'█'.repeat(filled)}${'░'.repeat(10 - filled)}\` ${percentage}%\n\n` +
						(keys >= KEYS_REQUIRED
							? `De vault is klaar! Gebruik \`/vault open\` voor **${VAULT_POINTS} scoreboardpunten**.`
							: `Nog **${KEYS_REQUIRED - keys} sleutels** nodig.`)
					)],
			});
			return;
		}

		const opening = await openVault(
			interaction.guildId, districtRoleId, interaction.user.id, KEYS_REQUIRED, VAULT_POINTS
		);
		if (!opening) {
			const keys = await getKeyBalance(interaction.guildId, districtRoleId);
			await interaction.editReply(
				`De vault kan nog niet open: **${keys}/${KEYS_REQUIRED} sleutels** verzameld.`
			);
			return;
		}
		await refreshLiveScoreboard(interaction.guild).catch(console.error);
		await interaction.editReply({
			embeds: [new EmbedBuilder()
				.setColor(0xf1c40f)
				.setTitle('🔓 De districtvault is geopend!')
				.setDescription(
					`${interaction.user} heeft namens <@&${districtRoleId}> **${KEYS_REQUIRED} sleutels** gebruikt.\n\n` +
					`🏆 **+${VAULT_POINTS} districtpunten**\n` +
					`🔑 Resterende voorraad: **${opening.remainingKeys}**`
				)],
		});
	},

	KEYS_REQUIRED,
	VAULT_POINTS,
};
