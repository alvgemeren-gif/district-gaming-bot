const { EmbedBuilder } = require('discord.js');
const {
	createChallenge,
	getDueConfigs,
	scheduleNext,
	setChallengeMessage,
} = require('./artChallengeStore');

const subjects = [
	'a forgotten city floating above the clouds',
	'a creature that collects lost memories',
	'a quiet café at the edge of the universe',
	'a garden growing inside an abandoned machine',
	'a hero whose shadow has a life of its own',
	'an underwater library discovered at midnight',
	'a doorway that appears only during thunderstorms',
	'the last train travelling through a dream',
	'a tiny civilization living inside an old lantern',
	'a celebration on a distant moon',
];

const constraints = [
	'Use a limited palette of no more than four colors.',
	'Tell the story without drawing any human faces.',
	'Make light and shadow the main focus of the composition.',
	'Include one object that clearly does not belong in the scene.',
	'Combine something futuristic with something ancient.',
	'Create it from an unusual point of view.',
	'Use repeating shapes to guide the viewer through the artwork.',
	'Make the scene feel peaceful and unsettling at the same time.',
];

function generatePrompt(seed = Date.now()) {
	const week = Math.floor(Number(seed) / (7 * 24 * 60 * 60 * 1000));
	const subject = subjects[week % subjects.length];
	const constraint = constraints[(week * 3 + 1) % constraints.length];
	return `Create an original artwork depicting ${subject}. ${constraint} Any visual medium is welcome.`;
}

async function postWeeklyChallenge(client, config) {
	const guild = await client.guilds.fetch(config.guild_id).catch(() => null);
	const channel = await guild?.channels.fetch(config.channel_id).catch(() => null);
	if (!channel?.isTextBased()) throw new Error(`Art challenge channel ${config.channel_id} is unavailable.`);

	const challenge = await createChallenge(config.guild_id, generatePrompt());
	const message = await channel.send({
		embeds: [new EmbedBuilder()
			.setColor(0xeb459e)
			.setTitle('Weekly Art Challenge')
			.setDescription(challenge.prompt)
			.addFields(
				{ name: 'Deadline', value: `<t:${Math.floor(new Date(challenge.ends_at).getTime() / 1000)}:F>`, inline: true },
				{ name: 'How to enter', value: 'Use `/art-challenge submit` and upload your artwork.', inline: true },
			)
			.setFooter({ text: 'A new creative challenge is posted every seven days.' })],
	});
	await setChallengeMessage(challenge.id, message.id);
	await scheduleNext(config.guild_id);
	return challenge;
}

async function refreshArtChallenges(client) {
	const configs = await getDueConfigs();
	for (const config of configs) {
		await postWeeklyChallenge(client, config).catch(error => {
			console.error(`Could not post weekly art challenge for guild ${config.guild_id}:`, error);
		});
	}
}

function startArtChallengeScheduler(client) {
	refreshArtChallenges(client).catch(console.error);
	return setInterval(() => refreshArtChallenges(client).catch(console.error), 60 * 1000);
}

module.exports = { generatePrompt, postWeeklyChallenge, startArtChallengeScheduler };
