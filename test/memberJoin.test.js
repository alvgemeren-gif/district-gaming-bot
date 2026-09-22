const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load(name, dependencies) {
	const module = { exports: {} };
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../utils', name), 'utf8'), {
		module,
		require: name => {
			assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
			return dependencies[name];
		},
		console: { error() {}, warn() {} },
	});
	return module.exports;
}

for (const [file, method, row] of [
	['welcomeConfig.js', 'getWelcomeConfig', { channel_id: 'channel', message: 'Hello' }],
	['autoroleConfig.js', 'getAutoroleConfig', { role_ids: ['role'] }],
]) {
	test(`${file} retries failed initialization without initializing scores`, async () => {
		let attempts = 0;
		const store = load(file, {
			'./scoreStore': {
				pool: { async query(sql) {
					if (sql.includes('CREATE TABLE')) {
						if (++attempts === 1) throw new Error('Temporary database outage');
						return {};
					}
					return { rows: [row] };
				} },
				requireDatabase() { throw new Error('Score migration unavailable'); },
			},
		});
		await assert.rejects(store[method]('guild'), /Temporary database outage/);
		assert.ok(await store[method]('guild'));
		assert.ok(await store[method]('guild'));
		assert.equal(attempts, 2);
	});
}

test('welcome and valid autoroles proceed while invites and saved choices are pending', async () => {
	let release;
	const pending = new Promise(resolve => { release = resolve; });
	const added = [];
	const sent = [];
	const { handleMemberJoin } = load('memberJoin.js', {
		'./autoroleConfig': { getAutoroleConfig: async () => ({ roleIds: ['forbidden', 'valid'] }) },
		'./welcomeConfig': {
			getWelcomeConfig: async () => ({ channelId: 'channel', message: 'Hello' }),
			formatWelcomeMessage: message => message,
		},
		'./roleChoiceStore': { getRoleChoice: () => pending },
		'./inviteSystem': { handleInviteMemberAdd: () => pending },
	});
	const work = handleMemberJoin({
		id: 'member',
		guild: {
			id: 'guild',
			roles: { fetch: async id => ({ id }) },
			channels: { fetch: async () => ({
				isTextBased: () => true,
				send: async message => { sent.push(message); },
			}) },
		},
		roles: { add: async role => {
			if (role.id === 'forbidden') throw new Error('Missing permissions');
			added.push(role.id);
		} },
	});
	try {
		await new Promise(resolve => setImmediate(resolve));
		assert.deepEqual(added, ['valid']);
		assert.deepEqual(sent, ['Hello']);
	} finally {
		release(null);
		await work;
	}
});
