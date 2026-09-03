const test = require('node:test');
const assert = require('node:assert/strict');
const { formatBirthday, isValidBirthday, nextOccurrence, processGuildBirthdays, sortUpcoming } = require('../utils/birthdaySystem');

test('birthday dates are validated and formatted', () => {
	assert.equal(isValidBirthday(29, 2), true);
	assert.equal(isValidBirthday(31, 4), false);
	assert.equal(isValidBirthday(0, 1), false);
	assert.equal(formatBirthday(3, 9), '3 september');
});

test('upcoming birthdays wrap into the next year', () => {
	const now = new Date('2026-12-20T12:00:00Z');
	assert.equal(nextOccurrence(25, 12, now).toISOString(), '2026-12-25T00:00:00.000Z');
	assert.equal(nextOccurrence(2, 1, now).toISOString(), '2027-01-02T00:00:00.000Z');
	const sorted = sortUpcoming([
		{ user_id: 'jan', birth_day: 2, birth_month: 1 },
		{ user_id: 'dec', birth_day: 25, birth_month: 12 },
	], now);
	assert.deepEqual(sorted.map(item => item.user_id), ['dec', 'jan']);
});

test('daily processing assigns the role and announces only claimed birthdays', async () => {
	const sent = [];
	const added = [];
	const removed = [];
	const birthdayMember = { id: 'birthday', roles: { cache: new Map(), add: async role => added.push(role.id) } };
	const oldMember = { id: 'old', roles: { remove: async role => removed.push(role.id) } };
	const role = { id: 'role', members: new Map([['old', oldMember]]) };
	const guild = {
		id: 'guild',
		roles: { fetch: async () => role },
		members: { fetch: async id => id === 'birthday' ? birthdayMember : null },
		channels: { fetch: async () => ({ isTextBased: () => true, send: async payload => sent.push(payload) }) },
	};
	const store = {
		getBirthdayConfig: async () => ({ channelId: 'channel', roleId: 'role' }),
		listBirthdays: async () => [{ user_id: 'birthday', birth_day: 3, birth_month: 9 }],
		claimAnnouncement: async () => true,
	};
	assert.equal(await processGuildBirthdays(guild, new Date('2026-09-03T10:00:00Z'), store), 1);
	assert.deepEqual(added, ['role']);
	assert.deepEqual(removed, ['role']);
	assert.match(sent[0].content, /<@birthday>/);
});
