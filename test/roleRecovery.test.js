const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load(file, dependencies, extra = {}) {
	const module = { exports: {} };
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
		module, require: name => dependencies[name], console, ...extra,
	});
	return module.exports;
}

for (const [file, method, args, row] of [
	['roleChoiceStore', 'getRoleConfig', ['guild'], { role_ids: ['role'] }],
	['rolePanelStore', 'getRolePanel', ['1', 'guild'], { role_ids: ['role'] }],
]) {
	test(`${file} recovers after a failed first database connection`, async () => {
		let attempts = 0;
		const store = load(`utils/${file}.js`, {
			pg: { Pool: class {
				async query(sql) {
					if (sql.includes('CREATE TABLE')) {
						if (++attempts === 1) throw new Error('Database temporarily offline');
						return {};
					}
					return { rows: [row] };
				}
			} },
		}, { process: { env: { DATABASE_URL: 'test' } } });
		await assert.rejects(store[method](...args), /temporarily offline/);
		assert.ok(await store[method](...args));
		assert.ok(await store[method](...args));
		assert.equal(attempts, 2);
	});
}

test('choice button acknowledges before loading database and edits its response', async () => {
	const events = [];
	const command = load('commands/rollen/rollen.js', {
		'discord.js': require('discord.js'),
		'../../utils/roleChoiceStore': {
			getRoleConfig: async () => { events.push('database'); return null; },
		},
	});
	const interaction = {
		guildId: 'guild',
		async deferReply() { events.push('defer'); this.deferred = true; },
		async editReply(body) { events.push('edit'); assert.match(body.content, /niet meer actief/); },
		async reply() { assert.fail('Must edit the deferred response'); },
	};
	await command.assignChoice(interaction, 'role');
	assert.deepEqual(events, ['defer', 'database', 'edit']);
});

for (const [file, dependency, method, config] of [
	['autorole/autorole', 'autoroleConfig', 'getAutoroleConfig', { roleIds: [] }],
	['welcome/welcome', 'welcomeConfig', 'getWelcomeConfig', null],
]) {
	test(`${file} acknowledges status before loading settings`, async () => {
		const events = [];
		const command = load(`commands/${file}.js`, {
			'discord.js': require('discord.js'),
			[`../../utils/${dependency}`]: {
				[method]: async () => { events.push('database'); return config; },
			},
		});
		await command.execute({
			guildId: 'guild',
			memberPermissions: { has: () => true },
			options: { getSubcommand: () => 'status' },
			async deferReply() { events.push('defer'); this.deferred = true; },
			async editReply() { events.push('edit'); },
			async reply() { assert.fail('Must edit the deferred response'); },
		});
		assert.deepEqual(events, ['defer', 'database', 'edit']);
	});
}
