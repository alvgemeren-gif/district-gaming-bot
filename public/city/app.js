let game;
let page = 'city';
let busy = false;
let lastTick = Date.now();

const resourceNames = { coins: 'MUNTEN', materials: 'MATERIALEN', energy: 'ENERGIE', population: 'INWONERS' };
const achievements = {
	first_foundation: ['Eerste steen', 'Bouw je eerste gebouw'],
	population_100: ['Groeiende stad', 'Bereik 100 inwoners'],
	population_1000: ['Metropool', 'Bereik 1.000 inwoners'],
	builder_100: ['Meesterbouwer', 'Voer 100 upgrades uit'],
	millionaire: ['Miljonair', 'Verdien 1.000.000 munten'],
	future_perfect: ['Toekomststad', 'Voltooi al het onderzoek'],
};
const app = document.querySelector('#app');
const fmt = value => Math.floor(Number(value) || 0).toLocaleString('nl-NL');
const clone = id => document.querySelector(id).content.cloneNode(true);

async function api(endpoint, options = {}) {
	let response;
	try {
		response = await fetch(`/city/api/${endpoint}`, {
			credentials: 'same-origin',
			headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
			...options,
		});
	} catch {
		throw new Error('Geen verbinding met de server.');
	}
	const result = await response.json().catch(() => ({ error: 'Ongeldig antwoord van de server.' }));
	if (response.status === 401) {
		showStart();
		throw new Error('TEAM_REQUIRED');
	}
	if (!response.ok) throw new Error(result.error || 'Er ging iets mis.');
	return result;
}

function toast(message) {
	const element = document.querySelector('#toast');
	element.textContent = message;
	element.classList.add('show');
	setTimeout(() => element.classList.remove('show'), 2600);
}

function showChrome(visible) {
	document.querySelector('#header').hidden = !visible;
	document.querySelector('#nav').hidden = !visible;
}

async function showStart() {
	game = null;
	showChrome(false);
	app.replaceChildren(clone('#startPage'));
	const options = document.querySelector('#teamOptions');
	const error = document.querySelector('#startError');
	const submit = document.querySelector('#teamForm button');
	submit.disabled = true;
	try {
		const result = await api('teams');
		options.replaceChildren(...result.teams.map(team => {
			const label = document.createElement('label');
			label.className = 'team-option';
			const input = document.createElement('input');
			input.type = 'radio';
			input.name = 'team';
			input.value = team.id;
			input.required = true;
			const name = document.createElement('span');
			name.textContent = team.name;
			label.append(input, name);
			return label;
		}));
		submit.disabled = false;
	} catch (problem) {
		options.replaceChildren();
		error.textContent = problem.message;
		error.hidden = false;
	}
	document.querySelector('#teamForm').addEventListener('submit', async event => {
		event.preventDefault();
		const button = event.currentTarget.querySelector('button');
		const team = new FormData(event.currentTarget).get('team');
		if (!team) {
			error.textContent = 'Kies eerst één van de vijf districtteams.';
			error.hidden = false;
			return;
		}
		button.disabled = true;
		error.hidden = true;
		try {
			await api('join', { method: 'POST', body: JSON.stringify({ team }) });
			location.reload();
		} catch (problem) {
			if (problem.message !== 'TEAM_REQUIRED') {
				error.textContent = problem.message;
				error.hidden = false;
				button.disabled = false;
			}
		}
	});
}

function timeLeft(date) {
	const seconds = Math.max(0, Math.ceil((new Date(date) - Date.now()) / 1000));
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function render() {
	app.replaceChildren(clone(`#${page}Page`));
	document.querySelectorAll('nav button').forEach(button => button.classList.toggle('active', button.dataset.page === page));
	if (page === 'city') renderCity();
	if (page === 'research') renderResearch();
	if (page === 'ranking') renderRanking();
	if (page === 'profile') renderProfile();
}

function renderCity() {
	const state = game.state;
	document.querySelector('#district').textContent = state.city.district;
	document.querySelector('#cityName').textContent = state.city.name;
	document.querySelector('#level').textContent = state.city.level;
	document.querySelector('#power').textContent = fmt(state.city.power);
	const daily = document.querySelector('#daily');
	daily.disabled = !state.dailyReady;
	daily.textContent = state.dailyReady ? 'PAK DAGELIJKSE BONUS' : `VOLGENDE BONUS ${timeLeft(state.dailyAt)}`;
	const resources = document.querySelector('#resources');
	for (const [key, label] of Object.entries(resourceNames)) {
		const item = document.createElement('div');
		item.className = 'resource';
		item.innerHTML = `<small>${label}</small><b data-resource="${key}">${fmt(state.resources[key])}</b><em>${state.rates[key] >= 0 ? '+' : ''}${Number(state.rates[key]).toFixed(1)} per minuut</em>`;
		resources.append(item);
	}
	if (state.activeUpgrade) document.querySelector('#queue').textContent = `BOUW BEZIG · ${timeLeft(state.activeUpgrade.endsAt)}`;
	for (const [key, building] of Object.entries(state.buildings)) {
		const card = document.createElement('article');
		card.className = `building${building.locked ? ' locked' : ''}`;
		const unavailable = building.locked || Boolean(state.activeUpgrade);
		const cost = Object.entries(building.cost).map(([resource, value]) => `${fmt(value)} ${resourceNames[resource]}`).join(' · ');
		card.innerHTML = `<div class="building-top"><div class="icon">${building.icon}</div><div><small>LEVEL ${building.level}</small><h3>${building.name}</h3></div></div><p>${building.locked ? `Ontgrendelt bij ${fmt(building.unlock)} inwoners` : Object.entries(building.production).map(([resource,value]) => `${value * building.level} ${resourceNames[resource]}/min`).join(' · ') || 'Vergroot de teamkracht'}</p><button class="upgrade" data-action="upgrade" data-key="${key}" ${unavailable ? 'disabled' : ''}><span>${building.level ? 'UPGRADE' : 'BOUW'}</span><span>${cost}</span></button>`;
		document.querySelector('#buildings').append(card);
	}
}

function renderResearch() {
	const state = game.state;
	for (const [key, item] of Object.entries(state.research)) {
		const done = state.completedResearch.includes(key);
		const active = state.activeResearch?.key === key;
		const locked = item.requires && !state.completedResearch.includes(item.requires);
		const disabled = done || active || locked || Boolean(state.activeResearch);
		const card = document.createElement('article');
		card.className = 'list-card';
		card.innerHTML = `<div class="icon">⚗</div><div><h3>${item.name}</h3><p>${item.description}</p></div><button class="primary" data-action="research" data-key="${key}" ${disabled ? 'disabled' : ''}>${done ? 'KLAAR' : active ? timeLeft(state.activeResearch.endsAt) : locked ? 'GESLOTEN' : 'ONDERZOEK'}</button>`;
		document.querySelector('#researchList').append(card);
	}
}

function renderRanking() {
	const list = document.querySelector('#rankingList');
	if (!game.state.leaderboard.length) {
		list.innerHTML = '<article class="list-card">Nog geen teams in de ranglijst.</article>';
		return;
	}
	for (const team of game.state.leaderboard) {
		const card = document.createElement('article');
		card.className = 'list-card rank';
		card.innerHTML = `<span class="place">#${team.rank}</span><div><small>TEAM</small><b>${team.name}</b></div><div><small>KRACHT</small><b>${fmt(team.power)}</b></div><div><small>INWONERS</small><b>${fmt(team.population)}</b></div><div><small>STEDEN</small><b>${team.players}</b></div>`;
		list.append(card);
	}
}

function renderProfile() {
	const state = game.state;
	document.querySelector('#profileCity').textContent = state.city.name;
	document.querySelector('#profileLevel').textContent = state.city.level;
	document.querySelector('#profilePower').textContent = fmt(state.city.power);
	document.querySelector('#profileAchievements').textContent = `${state.achievements.length}/${Object.keys(achievements).length}`;
	for (const [key, [name, description]] of Object.entries(achievements)) {
		const unlocked = state.achievements.includes(key);
		const card = document.createElement('article');
		card.className = 'list-card';
		card.style.opacity = unlocked ? '1' : '.4';
		card.innerHTML = `<div class="icon">${unlocked ? '★' : '○'}</div><div><h3>${name}</h3><p>${description}</p></div>`;
		document.querySelector('#achievementList').append(card);
	}
}

async function perform(endpoint, payload = {}) {
	if (busy) return;
	busy = true;
	try {
		const result = await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
		game = result;
		render();
		if (result.reward) toast(`Bonus: +${fmt(result.reward.coins)} munten`);
	} catch (error) {
		if (error.message !== 'TEAM_REQUIRED') toast(error.message);
	} finally {
		busy = false;
	}
}

document.querySelector('#nav').addEventListener('click', event => {
	const button = event.target.closest('button[data-page]');
	if (!button || !game) return;
	page = button.dataset.page;
	render();
});

document.addEventListener('click', event => {
	const button = event.target.closest('button[data-action]');
	if (!button || button.disabled) return;
	if (button.dataset.action === 'daily') perform('daily');
	if (button.dataset.action === 'upgrade') perform('upgrade', { key: button.dataset.key });
	if (button.dataset.action === 'research') perform('research', { key: button.dataset.key });
});

setInterval(() => {
	if (!game) return;
	const minutes = (Date.now() - lastTick) / 60000;
	lastTick = Date.now();
	for (const key of Object.keys(resourceNames)) {
		game.state.resources[key] = Math.max(0, game.state.resources[key] + game.state.rates[key] * minutes);
		const element = document.querySelector(`[data-resource="${key}"]`);
		if (element) element.textContent = fmt(game.state.resources[key]);
	}
}, 1000);

api('state').then(result => {
	game = result;
	showChrome(true);
	document.querySelector('#teamName').textContent = result.state.city.district;
	document.querySelector('#connection').textContent = 'ONLINE';
	render();
	if (result.state.offline) toast(`Welkom terug! +${fmt(result.state.offline.coins)} munten`);
}).catch(error => {
	if (error.message !== 'TEAM_REQUIRED') app.innerHTML = `<section class="center"><h1>Kan simulatie niet laden</h1><p>${error.message}</p></section>`;
});
