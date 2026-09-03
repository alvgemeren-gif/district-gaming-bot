const birthdayStore = require('./birthdayStore');

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

function isValidBirthday(day, month) {
	if (!Number.isInteger(day) || !Number.isInteger(month) || month < 1 || month > 12 || day < 1) return false;
	return day <= new Date(Date.UTC(2000, month, 0)).getUTCDate();
}

function formatBirthday(day, month) {
	return `${day} ${MONTHS[month - 1]}`;
}

function nextOccurrence(day, month, now = new Date()) {
	let year = now.getUTCFullYear();
	let result = new Date(Date.UTC(year, month - 1, day));
	const today = Date.UTC(year, now.getUTCMonth(), now.getUTCDate());
	if (result.getTime() < today) result = new Date(Date.UTC(++year, month - 1, day));
	return result;
}

function sortUpcoming(items, now = new Date()) {
	return [...items].sort((a, b) => nextOccurrence(a.birth_day, a.birth_month, now) - nextOccurrence(b.birth_day, b.birth_month, now));
}

async function processGuildBirthdays(guild, now = new Date(), store = birthdayStore) {
	const config = await store.getBirthdayConfig(guild.id);
	if (!config) return 0;
	const birthdays = await store.listBirthdays(guild.id);
	const todays = birthdays.filter(item => item.birth_day === now.getUTCDate() && item.birth_month === now.getUTCMonth() + 1);
	const todayIds = new Set(todays.map(item => item.user_id));

	if (config.roleId) {
		const role = await guild.roles.fetch(config.roleId).catch(() => null);
		if (role) {
			for (const member of role.members.values()) {
				if (!todayIds.has(member.id)) await member.roles.remove(role, 'Verjaardag afgelopen').catch(() => {});
			}
			for (const item of todays) {
				const member = await guild.members.fetch(item.user_id).catch(() => null);
				if (member && !member.roles.cache.has(role.id)) await member.roles.add(role, 'Lid is vandaag jarig').catch(() => {});
			}
		}
	}

	const channel = await guild.channels.fetch(config.channelId).catch(() => null);
	if (!channel?.isTextBased()) return 0;
	let announced = 0;
	for (const item of todays) {
		const member = await guild.members.fetch(item.user_id).catch(() => null);
		if (!member || !(await store.claimAnnouncement(guild.id, item.user_id, now.getUTCFullYear()))) continue;
		try {
			await channel.send({
				content: `🎉 Van harte gefeliciteerd met je verjaardag, <@${item.user_id}>! 🎂\nMaak er een fantastische dag van! 🥳`,
				allowedMentions: { users: [item.user_id] },
			});
		} catch (error) {
			await store.releaseAnnouncement?.(guild.id, item.user_id, now.getUTCFullYear());
			throw error;
		}
		announced++;
	}
	return announced;
}

async function checkBirthdays(client, now = new Date()) {
	for (const guild of client.guilds.cache.values()) {
		await processGuildBirthdays(guild, now).catch(error => console.error(`Birthday check failed for guild ${guild.id}:`, error));
	}
}

function startBirthdayScheduler(client) {
	const run = () => checkBirthdays(client);
	run();
	return setInterval(run, CHECK_INTERVAL_MS);
}

module.exports = { CHECK_INTERVAL_MS, formatBirthday, isValidBirthday, nextOccurrence, processGuildBirthdays, sortUpcoming, startBirthdayScheduler };
