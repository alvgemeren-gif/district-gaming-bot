let game = null;
let view = 'city';
let clock = null;
let requestPending = false;
let lastPaint = Date.now();
let reconnectAttempt = 0;
let reconnectTimer = null;

const icons = { coins: '◉', materials: '⬡', energy: 'ϟ', population: '♟' };
const names = { coins: 'COINS', materials: 'MATERIALS', energy: 'ENERGY', population: 'POPULATION' };
const achievementInfo = {
	first_foundation: ['FIRST FOUNDATION', 'Build your first Habitat Pod'],
	population_100: ['GROWING FAST', 'Reach 100 population'],
	population_1000: ['MEGACITY', 'Reach 1,000 population'],
	builder_100: ['MASTER BUILDER', 'Upgrade buildings 100 times'],
	millionaire: ['TYCOON', 'Generate 1,000,000 coins'],
	future_perfect: ['FUTURE PERFECT', 'Complete every research project'],
};
const fmt = value => Math.floor(Number(value) || 0).toLocaleString();
const clone = selector => document.querySelector(selector).content.cloneNode(true);

function timeLeft(date) {
	if (!date) return '00:00';
	const seconds = Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / 1000));
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const remainder = seconds % 60;
	return hours > 0
		? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
		: `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function toast(text) {
	const element = document.querySelector('#toast');
	element.textContent = text;
	element.classList.add('show');
	window.setTimeout(() => element.classList.remove('show'), 2800);
}

function connectionStatus(status, label) {
	const element = document.querySelector('#connection');
	if (!element) return;
	element.dataset.status = status;
	element.textContent = label;
}

function scheduleReconnect() {
	if (reconnectTimer || !game) return;
	const delay = Math.min(30000, 1000 * (2 ** reconnectAttempt));
	reconnectAttempt += 1;
	connectionStatus('offline', `RECONNECTING ${Math.ceil(delay / 1000)}S`);
	reconnectTimer = window.setTimeout(async () => {
		reconnectTimer = null;
		await refreshState();
	}, delay);
}

function setBusy(busy) {
	requestPending = busy;
	document.querySelectorAll('button[data-action]').forEach(button => {
		button.disabled = busy || button.dataset.unavailable === 'true';
	});
}

async function api(endpoint, options = {}) {
	let response;
	try {
		response = await fetch(`/city/api/${endpoint}`, {
			credentials: 'same-origin',
			headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
			...options,
		});
	} catch {
		throw new Error('Network connection interrupted. Your city is safe.');
	}
	let result;
	try { result = await response.json(); } catch { throw new Error('The server returned an invalid response.'); }
	if (response.status === 401) {
		showLogin();
		throw new Error('Your session expired. Log in again.');
	}
	if (!response.ok) throw new Error(result.error || 'The action could not be completed.');
	return result;
}

async function perform(endpoint, payload = {}) {
	if (requestPending) return;
	setBusy(true);
	try {
		const result = await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
		game.state = result.state;
		render();
		if (result.reward) toast(`Supply drop: +${fmt(result.reward.coins)} coins`);
	} catch (error) {
		toast(error.message);
	} finally {
		setBusy(false);
	}
}

async function refreshState() {
	if (requestPending || !game) return;
	requestPending = true;
	try {
		const result = await api('state');
		game = result;
		reconnectAttempt = 0;
		connectionStatus(result.connection?.discord === 'cached' ? 'cached' : 'online', result.connection?.discord === 'cached' ? 'DISCORD CACHED' : 'LIVE SYNC');
		render();
	} catch (error) {
		toast(error.message);
		scheduleReconnect();
	} finally {
		requestPending = false;
	}
}

function render() {
	const app = document.querySelector('#app');
	app.replaceChildren(clone(`#${view}View`));
	document.querySelectorAll('nav button').forEach(button => button.classList.toggle('active', button.dataset.view === view));
	if (view === 'city') renderCity();
	if (view === 'research') renderResearch();
	if (view === 'district') renderDistrict();
	if (view === 'profile') renderProfile();
	updateClock();
}

function renderCity() {
	const state = game.state;
	document.querySelector('#districtLabel').textContent = state.city.district;
	document.querySelector('#cityName').textContent = state.city.name;
	document.querySelector('#cityLevel').textContent = state.city.level;
	document.querySelector('#cityPower').textContent = fmt(state.city.power);
	const daily = document.querySelector('#daily');
	daily.dataset.action = 'daily';
	daily.dataset.unavailable = String(!state.dailyReady);
	daily.disabled = !state.dailyReady;
	daily.innerHTML = state.dailyReady
		? 'CLAIM SUPPLY DROP <small>DAILY REWARD</small>'
		: `NEXT DROP <span data-countdown="${state.dailyAt}">${timeLeft(state.dailyAt)}</span><small>COME BACK SOON</small>`;

	const resources = document.querySelector('#resources');
	for (const key of Object.keys(icons)) {
		const card = document.createElement('div');
		card.className = 'resource';
		card.innerHTML = `<i>${icons[key]}</i><div><small>${names[key]}</small><b data-resource="${key}">${fmt(state.resources[key])}</b><em>${state.rates[key] >= 0 ? '+' : ''}${Number(state.rates[key]).toFixed(1)} / MIN</em></div>`;
		resources.append(card);
	}

	if (state.activeUpgrade) {
		const building = state.buildings[state.activeUpgrade.key];
		document.querySelector('#queue').innerHTML = `UPGRADING ${building.name} · <span data-countdown="${state.activeUpgrade.endsAt}">${timeLeft(state.activeUpgrade.endsAt)}</span>`;
	}
	const grid = document.querySelector('#buildings');
	for (const [key, building] of Object.entries(state.buildings)) {
		const card = document.createElement('article');
		card.className = `building${building.locked ? ' locked' : ''}`;
		const production = Object.entries(building.production).map(([resource, amount]) => `${amount > 0 ? '+' : ''}${amount * building.level} ${resource}/min`).join(' · ')
			|| `+${Math.floor(building.power * building.level * (1 + building.level * .04))} district power`;
		const cost = Object.entries(building.cost).map(([resource, amount]) => `${fmt(amount)} ${resource}`).join(' · ');
		const unavailable = building.locked || Boolean(state.activeUpgrade);
		card.innerHTML = `<div class="building-icon">${building.icon}</div><div><span class="level">LEVEL ${building.level}</span><h3>${building.name}</h3><p class="production">${building.locked ? `Unlocks at ${fmt(building.unlock)} population` : production}</p></div><button class="upgrade" data-action="upgrade" data-key="${key}" data-unavailable="${unavailable}" ${unavailable ? 'disabled' : ''}><span>${building.level ? 'UPGRADE' : 'BUILD'} · ${cost}</span><span>${building.seconds}s</span></button>`;
		grid.append(card);
	}
}

function renderResearch() {
	const state = game.state;
	const list = document.querySelector('#researchList');
	for (const [key, research] of Object.entries(state.research)) {
		const done = state.completedResearch.includes(key);
		const active = state.activeResearch?.key === key;
		const locked = research.requires && !state.completedResearch.includes(research.requires);
		const unavailable = done || active || locked || Boolean(state.activeResearch);
		const card = document.createElement('article');
		card.className = `research-card${done ? ' done' : ''}`;
		const label = done ? 'COMPLETE' : active
			? `<span data-countdown="${state.activeResearch.endsAt}">${timeLeft(state.activeResearch.endsAt)}</span>`
			: locked ? 'LOCKED' : 'RESEARCH';
		card.innerHTML = `<div class="building-icon">⚗</div><div><b>${research.name}</b><p>${research.description}</p><small>${Object.entries(research.cost).map(([resource, amount]) => `${fmt(amount)} ${resource}`).join(' · ')}</small></div><button class="daily" data-action="research" data-key="${key}" data-unavailable="${unavailable}" ${unavailable ? 'disabled' : ''}>${label}</button>`;
		list.append(card);
	}
}

function renderDistrict() {
	const list = document.querySelector('#leaderboard');
	for (const district of game.state.leaderboard) {
		const row = document.createElement('article');
		row.className = 'rank';
		row.innerHTML = `<span class="place">#${district.rank}</span><div><small>DISTRICT</small><b>${district.name}</b></div><div><small>POWER</small><b>${fmt(district.power)}</b></div><div><small>POPULATION</small><b>${fmt(district.population)}</b></div><div><small>BUILDINGS</small><b>${fmt(district.buildings)}</b></div><div><small>AVG CITY</small><b>${district.averageLevel.toFixed(1)}</b></div>`;
		list.append(row);
	}
}

function renderProfile() {
	const state = game.state;
	document.querySelector('#profileCity').textContent = state.city.name;
	document.querySelector('#pLevel').textContent = state.city.level;
	document.querySelector('#pPower').textContent = fmt(state.city.power);
	document.querySelector('#pAchievements').textContent = `${state.achievements.length} / ${Object.keys(achievementInfo).length}`;
	const list = document.querySelector('#achievements');
	for (const [key, [name, description]] of Object.entries(achievementInfo)) {
		const unlocked = state.achievements.includes(key);
		const item = document.createElement('article');
		item.className = `achievement${unlocked ? '' : ' locked'}`;
		item.innerHTML = `<div class="building-icon">${unlocked ? '★' : '?'}</div><div><b>${name}</b><p>${description}</p></div>`;
		list.append(item);
	}
}

function updateClock() {
	if (!game) return;
	const now = Date.now();
	const minutes = Math.max(0, (now - lastPaint) / 60000);
	lastPaint = now;
	for (const key of Object.keys(icons)) {
		game.state.resources[key] = Math.max(0, game.state.resources[key] + game.state.rates[key] * minutes);
		const counter = document.querySelector(`[data-resource="${key}"]`);
		if (counter) counter.textContent = fmt(game.state.resources[key]);
	}
	let timerFinished = false;
	document.querySelectorAll('[data-countdown]').forEach(element => {
		element.textContent = timeLeft(element.dataset.countdown);
		if (new Date(element.dataset.countdown).getTime() <= now) timerFinished = true;
	});
	if (timerFinished) refreshState();
}

function showLogin(reason) {
	document.querySelectorAll('.game-chrome').forEach(element => { element.hidden = true; });
	document.querySelector('#app').replaceChildren(clone('#loginView'));
	const messages = { cancelled: 'Login was cancelled. Nothing was changed.', expired: 'Your login request expired. Please try again.', district: 'Your Discord account does not have a valid district yet.' };
	if (messages[reason]) {
		const error = document.querySelector('#loginError');
		error.textContent = messages[reason];
		error.hidden = false;
	}
}

document.addEventListener('click', event => {
	const nav = event.target.closest('nav button[data-view]');
	if (nav && game) {
		view = nav.dataset.view;
		render();
		return;
	}
	const action = event.target.closest('button[data-action]');
	if (!action || action.disabled) return;
	if (action.dataset.action === 'daily') perform('daily');
	if (action.dataset.action === 'upgrade') perform('upgrade', { key: action.dataset.key });
	if (action.dataset.action === 'research') perform('research', { key: action.dataset.key });
});

const loginReason = new URLSearchParams(location.search).get('login');
api('state').then(result => {
	game = result;
	reconnectAttempt = 0;
	document.querySelectorAll('.game-chrome').forEach(element => { element.hidden = false; });
	document.querySelector('#player').textContent = result.player.username;
	if (result.player.avatar) document.querySelector('#avatar').src = result.player.avatar;
	connectionStatus(result.connection?.discord === 'cached' ? 'cached' : 'online', result.connection?.discord === 'cached' ? 'DISCORD CACHED' : 'LIVE SYNC');
	render();
	if (result.state.offline) toast(`Welcome back! +${fmt(result.state.offline.coins)} coins · +${fmt(result.state.offline.materials)} materials`);
}).catch(error => {
	if (error.message.includes('session expired')) return;
	if (error.message.includes('district')) { showLogin('district'); return; }
	document.querySelector('#app').innerHTML = `<section class="loading"><div class="spinner"></div><h2>CONNECTING TO CITY</h2><p>${error.message}</p><a class="daily" href="/city">TRY AGAIN</a></section>`;
});

if (loginReason && !game) showLogin(loginReason);
clock = window.setInterval(updateClock, 1000);
window.addEventListener('online', () => { connectionStatus('online', 'RECONNECTING'); refreshState(); });
window.addEventListener('offline', () => connectionStatus('offline', 'OFFLINE · CITY SAFE'));
window.setInterval(() => {
	if (!game || requestPending || document.hidden) return;
	fetch('/city/api/health', { cache: 'no-store' })
		.then(response => {
			if (!response.ok) throw new Error();
			if (reconnectAttempt === 0) connectionStatus('online', 'LIVE SYNC');
		})
		.catch(() => { connectionStatus('offline', 'RECONNECTING'); scheduleReconnect(); });
}, 30000);
