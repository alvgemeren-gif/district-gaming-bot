const { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { getGame, guess, startGame, stopGame } = require('../../utils/guessNumberGame');

const data = new SlashCommandBuilder()
	.setName('guess-number')
	.setDescription('Speel Guess the Number in dit kanaal.')
	.addSubcommand(subcommand => subcommand
		.setName('start')
		.setDescription('Start een nieuw raadspel.')
		.addIntegerOption(option => option
			.setName('maximum')
			.setDescription('Het hoogste mogelijke getal (standaard 100).')
			.setMinValue(10)
			.setMaxValue(1000)))
	.addSubcommand(subcommand => subcommand
		.setName('guess')
		.setDescription('Raad het geheime getal.')
		.addIntegerOption(option => option
			.setName('getal')
			.setDescription('Jouw gok.')
			.setMinValue(1)
			.setMaxValue(1000)
			.setRequired(true)))
	.addSubcommand(subcommand => subcommand
		.setName('stop')
		.setDescription('Stop het huidige spel.'));

module.exports = {
	data,

	async execute(interaction) {
		const action = interaction.options.getSubcommand();
		const context = { guildId: interaction.guildId, channelId: interaction.channelId };

		if (action === 'start') {
			const max = interaction.options.getInteger('maximum') || 100;
			const result = startGame({ ...context, hostId: interaction.user.id, max });
			if (result.status === 'already_active') {
				await interaction.reply({ content: '🎮 Er loopt al een spel in dit kanaal. Gebruik `/guess-number guess`!', ephemeral: true });
				return;
			}
			await interaction.reply({
				embeds: [new EmbedBuilder()
					.setColor(0x5865f2)
					.setTitle('🔢 Guess the Number')
					.setDescription(`Ik heb een getal gekozen tussen **1 en ${max}**. Er is geen limiet op het aantal pogingen.\n\nGebruik \`/guess-number guess getal:<nummer>\`. Na iedere gok moet een andere speler aan de beurt.`)],
			});
			return;
		}

		if (action === 'stop') {
			const game = getGame(context);
			if (!game) {
				await interaction.reply({ content: 'Er loopt geen spel in dit kanaal.', ephemeral: true });
				return;
			}
			const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
			if (game.hostId !== interaction.user.id && !isAdmin) {
				await interaction.reply({ content: 'Alleen de starter of een serverbeheerder kan dit spel stoppen.', ephemeral: true });
				return;
			}
			const stopped = stopGame(context);
			await interaction.reply(`🛑 Het spel is gestopt. Het geheime getal was **${stopped.answer}**.`);
			return;
		}

		const number = interaction.options.getInteger('getal');
		const result = guess({ ...context, number, playerId: interaction.user.id });
		const messages = {
			no_game: 'Er loopt geen spel. Start er een met `/guess-number start`.',
			out_of_range: `Kies een heel getal tussen **1 en ${result.max}**.`,
			not_your_turn: `${interaction.user}, je hebt net al gegokt. Eerst is een andere speler aan de beurt.`,
			correct: `🎉 ${interaction.user} heeft het goed! Het getal was **${result.answer}**.`,
			higher: `📈 Het geheime getal is **hoger** dan **${number}**! Nu is een andere speler aan de beurt.`,
			lower: `📉 Het geheime getal is **lager** dan **${number}**! Nu is een andere speler aan de beurt.`,
		};
		await interaction.reply(messages[result.status]);
	},
};
