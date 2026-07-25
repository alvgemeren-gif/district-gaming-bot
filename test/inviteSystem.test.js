const assert = require('node:assert/strict');
const test = require('node:test');
const { findUsedInvite, snapshotInvites } = require('../utils/inviteSystem');

test('invite collections are converted into usable snapshots', () => {
	const snapshot = snapshotInvites([
		{ code: 'abc', uses: 3, inviter: { id: 'member-1' } },
		{ code: 'def', uses: null, inviter: null },
	]);

	assert.deepEqual(snapshot.get('abc'), { uses: 3, inviterId: 'member-1' });
	assert.deepEqual(snapshot.get('def'), { uses: 0, inviterId: null });
});

test('the used invite is detected by its increased use count', () => {
	const previous = new Map([
		['abc', { uses: 2, inviterId: 'member-1' }],
		['def', { uses: 5, inviterId: 'member-2' }],
	]);
	const current = new Map([
		['abc', { uses: 3, inviterId: 'member-1' }],
		['def', { uses: 5, inviterId: 'member-2' }],
	]);

	assert.deepEqual(findUsedInvite(previous, current), {
		code: 'abc',
		inviterId: 'member-1',
		increase: 1,
	});
});

test('an invite without an increased use count has no inviter', () => {
	const snapshot = new Map([['abc', { uses: 2, inviterId: 'member-1' }]]);
	assert.equal(findUsedInvite(snapshot, snapshot), null);
});
