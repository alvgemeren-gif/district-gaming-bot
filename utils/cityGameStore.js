const { pool, requireDatabase } = require('./scoreStore');
const { BUILDINGS, RESEARCH, upgradeCost, upgradeSeconds } = require('./cityGameContent');

let schemaPromise;
const MAX_OFFLINE_SECONDS = 12 * 60 * 60;

async function ensureSchema() {
	await requireDatabase();
	if (!schemaPromise) schemaPromise = pool.query(`
		CREATE TABLE IF NOT EXISTS city_players (
			guild_id TEXT NOT NULL, user_id TEXT NOT NULL, username TEXT NOT NULL,
			avatar TEXT, district_role_id TEXT NOT NULL, city_name TEXT NOT NULL,
			coins NUMERIC(20,2) NOT NULL DEFAULT 500, materials NUMERIC(20,2) NOT NULL DEFAULT 160,
			energy NUMERIC(20,2) NOT NULL DEFAULT 80, population NUMERIC(20,2) NOT NULL DEFAULT 0,
			buildings JSONB NOT NULL DEFAULT '{}'::JSONB, research JSONB NOT NULL DEFAULT '[]'::JSONB,
			active_upgrade JSONB, active_research JSONB, achievements JSONB NOT NULL DEFAULT '[]'::JSONB,
			lifetime_coins NUMERIC(20,2) NOT NULL DEFAULT 0, upgrades INTEGER NOT NULL DEFAULT 0,
			last_tick TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_daily TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (guild_id, user_id)
		);
		CREATE TABLE IF NOT EXISTS city_action_logs (
			id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
			action TEXT NOT NULL, details JSONB NOT NULL DEFAULT '{}'::JSONB,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS city_action_logs_player ON city_action_logs (guild_id, user_id, created_at DESC);
	`);
	return schemaPromise;
}

function production(row) {
	const totals = { coins: 0, materials: 0, energy: 0, population: 0 };
	for (const [key, levelValue] of Object.entries(row.buildings || {})) {
		const item = BUILDINGS[key];
		const level = Number(levelValue);
		if (!item || level < 1) continue;
		for (const [resource, rate] of Object.entries(item.production)) totals[resource] += rate * level;
	}
	const tech = Array.isArray(row.research) ? row.research : [];
	const all = tech.includes('automation') ? 1.15 : 1;
	totals.coins *= all * (tech.includes('economy') ? 1.15 : 1);
	totals.materials *= all * (tech.includes('mining') ? 1.1 : 1);
	totals.energy *= all * (tech.includes('renewable') ? 1.2 : 1);
	totals.population *= all * (tech.includes('growth') ? 1.1 : 1);
	if (totals.energy < 0 && Number(row.energy) <= 0) {
		totals.coins = 0;
		totals.materials = 0;
		totals.energy = 0;
	}
	return totals;
}

function cityPower(row) {
	const buildingPower = Object.entries(row.buildings || {}).reduce((sum, [key, level]) => sum + ((BUILDINGS[key]?.power || 0) * Number(level) * (1 + Number(level) * 0.04)), 0);
	return Math.floor(buildingPower + Number(row.population) * 0.2 + (row.research?.length || 0) * 150 + (row.achievements?.length || 0) * 75);
}

function cityLevel(row) {
	const levels = Object.values(row.buildings || {}).reduce((sum, level) => sum + Number(level), 0);
	return Math.max(1, Math.floor(Math.sqrt(levels + (row.research?.length || 0) * 3)) + 1);
}

function completeTimers(row, now) {
	let changed = false;
	if (row.active_upgrade && new Date(row.active_upgrade.endsAt) <= now) {
		const key = row.active_upgrade.key;
		row.buildings = { ...(row.buildings || {}), [key]: Number(row.buildings?.[key] || 0) + 1 };
		row.active_upgrade = null;
		row.upgrades = Number(row.upgrades) + 1;
		changed = true;
	}
	if (row.active_research && new Date(row.active_research.endsAt) <= now) {
		row.research = [...new Set([...(row.research || []), row.active_research.key])];
		row.active_research = null;
		changed = true;
	}
	return changed;
}

function unlockAchievements(row) {
	const owned = new Set(row.achievements || []);
	const totalLevels = Object.values(row.buildings || {}).reduce((sum, n) => sum + Number(n), 0);
	if (Number(row.buildings?.house || 0) > 0) owned.add('first_foundation');
	if (Number(row.population) >= 100) owned.add('population_100');
	if (Number(row.population) >= 1000) owned.add('population_1000');
	if (totalLevels >= 100) owned.add('builder_100');
	if (Number(row.lifetime_coins) >= 1_000_000) owned.add('millionaire');
	if ((row.research || []).length === Object.keys(RESEARCH).length) owned.add('future_perfect');
	row.achievements = [...owned];
}

async function tick(client, row, offline = false) {
	const now = new Date();
	completeTimers(row, now);
	const elapsed = Math.max(0, Math.min(MAX_OFFLINE_SECONDS, (now - new Date(row.last_tick)) / 1000));
	const rates = production(row);
	const gained = {};
	for (const resource of ['coins', 'materials', 'energy', 'population']) {
		gained[resource] = Math.max(resource === 'energy' ? -Number(row.energy) : 0, rates[resource] * elapsed / 60);
		row[resource] = Math.max(0, Number(row[resource]) + gained[resource]);
	}
	row.lifetime_coins = Number(row.lifetime_coins) + Math.max(0, gained.coins);
	row.last_tick = now;
	unlockAchievements(row);
	await client.query(`UPDATE city_players SET coins=$3, materials=$4, energy=$5, population=$6, buildings=$7,
		research=$8, active_upgrade=$9, active_research=$10, achievements=$11, lifetime_coins=$12,
		upgrades=$13, last_tick=$14, updated_at=NOW() WHERE guild_id=$1 AND user_id=$2`,
		[row.guild_id, row.user_id, row.coins, row.materials, row.energy, row.population, row.buildings,
			row.research, row.active_upgrade, row.active_research, row.achievements, row.lifetime_coins,
			row.upgrades, row.last_tick]);
	return offline && elapsed > 60 ? { seconds: Math.floor(elapsed), ...gained } : null;
}

async function withPlayer(identity, action) {
	await ensureSchema();
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		await client.query(`INSERT INTO city_players (guild_id,user_id,username,avatar,district_role_id,city_name)
			VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (guild_id,user_id) DO UPDATE
			SET username=EXCLUDED.username,avatar=EXCLUDED.avatar,
			    district_role_id=EXCLUDED.district_role_id,updated_at=NOW()`,
			[identity.guildId, identity.userId, identity.username.slice(0, 80), identity.avatar, identity.districtRoleId, `${identity.username.slice(0, 24)} Prime`]);
		const result = await client.query('SELECT * FROM city_players WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [identity.guildId, identity.userId]);
		const row = result.rows[0];
		const offline = await tick(client, row, action === null);
		const value = action ? await action(client, row) : { row, offline };
		await client.query('COMMIT');
		return value;
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally { client.release(); }
}

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
async function log(client, row, action, details) {
	await client.query('INSERT INTO city_action_logs (guild_id,user_id,action,details) VALUES ($1,$2,$3,$4)', [row.guild_id, row.user_id, action, details]);
}

async function upgrade(identity, key) {
	if (!BUILDINGS[key]) fail('Unknown building.');
	return withPlayer(identity, async (client, row) => {
		if (row.active_upgrade) fail('Another upgrade is already in progress.', 409);
		const item = BUILDINGS[key];
		if (Number(row.population) < item.unlock) fail(`Requires ${item.unlock} population.`, 403);
		const level = Number(row.buildings?.[key] || 0);
		const cost = upgradeCost(key, level);
		for (const [resource, amount] of Object.entries(cost)) if (Number(row[resource]) < amount) fail(`Not enough ${resource}.`, 409);
		for (const [resource, amount] of Object.entries(cost)) row[resource] = Number(row[resource]) - amount;
		row.active_upgrade = { key, endsAt: new Date(Date.now() + upgradeSeconds(key, level, row.research) * 1000).toISOString() };
		await client.query('UPDATE city_players SET coins=$3,materials=$4,active_upgrade=$5 WHERE guild_id=$1 AND user_id=$2', [row.guild_id,row.user_id,row.coins,row.materials,row.active_upgrade]);
		await log(client,row,'upgrade_started',{ key, level: level + 1, cost });
		return row;
	});
}

async function research(identity, key) {
	if (!RESEARCH[key]) fail('Unknown technology.');
	return withPlayer(identity, async (client, row) => {
		const tech = RESEARCH[key];
		if (row.active_research) fail('Research is already in progress.', 409);
		if (row.research.includes(key)) fail('Technology already researched.', 409);
		if (tech.requires && !row.research.includes(tech.requires)) fail('Previous research is required.', 403);
		if (!row.buildings?.lab) fail('Build a Research Lab first.', 403);
		for (const [resource, amount] of Object.entries(tech.cost)) if (Number(row[resource]) < amount) fail(`Not enough ${resource}.`, 409);
		for (const [resource, amount] of Object.entries(tech.cost)) row[resource] = Number(row[resource]) - amount;
		row.active_research = { key, endsAt: new Date(Date.now() + tech.time * 1000).toISOString() };
		await client.query('UPDATE city_players SET coins=$3,materials=$4,active_research=$5 WHERE guild_id=$1 AND user_id=$2', [row.guild_id,row.user_id,row.coins,row.materials,row.active_research]);
		await log(client,row,'research_started',{ key, cost: tech.cost });
		return row;
	});
}

async function daily(identity) {
	return withPlayer(identity, async (client,row) => {
		if (row.last_daily && Date.now() - new Date(row.last_daily) < 86400000) fail('Daily supply drop is not ready yet.', 409);
		const reward = { coins: 1000 + cityLevel(row) * 250, materials: 400 + cityLevel(row) * 100, energy: 150 };
		for (const [key,value] of Object.entries(reward)) row[key] = Number(row[key]) + value;
		row.last_daily = new Date();
		await client.query('UPDATE city_players SET coins=$3,materials=$4,energy=$5,last_daily=$6 WHERE guild_id=$1 AND user_id=$2',[row.guild_id,row.user_id,row.coins,row.materials,row.energy,row.last_daily]);
		await log(client,row,'daily_claimed',reward);
		return { row, reward };
	});
}

async function rename(identity, name) {
	const clean = String(name || '').trim();
	if (!/^[\p{L}\p{N} .'-]{3,28}$/u.test(clean)) fail('Use 3–28 letters, numbers or spaces.');
	return withPlayer(identity, async (client,row) => {
		row.city_name = clean;
		await client.query('UPDATE city_players SET city_name=$3 WHERE guild_id=$1 AND user_id=$2',[row.guild_id,row.user_id,clean]);
		await log(client,row,'city_renamed',{ name: clean });
		return row;
	});
}

async function leaderboard(guildId) {
	await ensureSchema();
	const result = await pool.query('SELECT * FROM city_players WHERE guild_id=$1',[guildId]);
	const districts = new Map();
	for (const row of result.rows) {
		const d = districts.get(row.district_role_id) || { roleId: row.district_role_id, power: 0, population: 0, buildings: 0, players: 0, levels: 0 };
		d.power += cityPower(row); d.population += Math.floor(Number(row.population));
		d.buildings += Object.values(row.buildings || {}).filter(Number).length; d.levels += cityLevel(row); d.players += 1;
		districts.set(row.district_role_id, d);
	}
	return [...districts.values()].sort((a,b)=>b.power-a.power).map((d,i)=>({ ...d, rank:i+1, averageLevel:d.players?d.levels/d.players:0 }));
}

function publicState(row, offline, districtName, boards) {
	const rates = production(row);
	const buildings = Object.fromEntries(Object.entries(BUILDINGS).map(([key,item])=>[key,{ ...item, level:Number(row.buildings?.[key]||0), cost:upgradeCost(key,Number(row.buildings?.[key]||0)), seconds:upgradeSeconds(key,Number(row.buildings?.[key]||0),row.research), locked:Number(row.population)<item.unlock }]));
	return { city:{ name:row.city_name, level:cityLevel(row), district:districtName, power:cityPower(row) },
		resources:{ coins:Number(row.coins),materials:Number(row.materials),energy:Number(row.energy),population:Number(row.population) },
		rates, buildings, research:RESEARCH, completedResearch:row.research, activeUpgrade:row.active_upgrade,
		activeResearch:row.active_research, achievements:row.achievements, dailyReady:!row.last_daily||Date.now()-new Date(row.last_daily)>=86400000,
		dailyAt:row.last_daily?new Date(new Date(row.last_daily).getTime()+86400000):null, offline, leaderboard:boards };
}

module.exports = { daily, ensureSchema, leaderboard, publicState, rename, research, upgrade, withPlayer };
