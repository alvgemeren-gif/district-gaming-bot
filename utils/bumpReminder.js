const BUMP_REMINDER_INTERVAL_MS = 2 * 60 * 60 * 1000;

function createBumpReminderPayload(roleId = null) {
	const mention = roleId ? `<@&${roleId}> ` : '';

	return {
		content: `${mention}🔔 The server can be bumped again! Use DISBOARD's **/bump** command in this channel.`,
		allowedMentions: roleId ? { roles: [roleId] } : { parse: [] },
	};
}

async function sendBumpReminder(client, channelId, roleId = null) {
	const channel = await client.channels.fetch(channelId).catch(() => null);

	if (!channel?.isTextBased()) {
		throw new Error(`Bump reminder channel ${channelId} was not found or is not text-based.`);
	}

	return channel.send(createBumpReminderPayload(roleId));
}

function startBumpReminder(client, {
	channelId = process.env.BUMP_CHANNEL_ID,
	roleId = process.env.BUMP_ROLE_ID || null,
	intervalMs = BUMP_REMINDER_INTERVAL_MS,
} = {}) {
	if (!channelId) {
		console.log('Bump reminder disabled: BUMP_CHANNEL_ID is not configured.');
		return null;
	}

	const remind = () => {
		sendBumpReminder(client, channelId, roleId).catch(error => {
			console.error('Scheduled bump reminder failed:', error);
		});
	};

	const timer = setInterval(remind, intervalMs);
	console.log(`Bump reminder enabled for channel ${channelId}; first reminder in two hours.`);
	return timer;
}

module.exports = {
	BUMP_REMINDER_INTERVAL_MS,
	createBumpReminderPayload,
	sendBumpReminder,
	startBumpReminder,
};
