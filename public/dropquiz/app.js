const TOTAL_ROUNDS = 10;
const ROUND_SECONDS = 15;
const els = Object.fromEntries([...document.querySelectorAll('[id]')].map(element => [element.id, element]));
let state = null;
let tick = null;
let audioEnabled = true;

const pad = value => String(value).padStart(4, '0');
const shuffle = items => {
	const copy = [...items];
	for (let index = copy.length - 1; index; index--) {
		const other = Math.floor(Math.random() * (index + 1));
		[copy[index], copy[other]] = [copy[other], copy[index]];
	}
	return copy;
};

function beep(frequency, duration = .08) {
	if (!audioEnabled) return;
	try {
		const context = new AudioContext();
		const oscillator = context.createOscillator();
		const gain = context.createGain();
		oscillator.frequency.value = frequency;
		gain.gain.setValueAtTime(.045, context.currentTime);
		gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + duration);
		oscillator.connect(gain).connect(context.destination);
		oscillator.start();
		oscillator.stop(context.currentTime + duration);
	} catch {}
}

async function loadMap(mode) {
	const response = await fetch(`/dropquiz/api/map?mode=${mode}`);
	const data = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(data.error || 'De kaart kon niet worden geladen.');
	return data;
}

function setScreen(screen) {
	['intro', 'game', 'finish'].forEach(name => { els[name].hidden = name !== screen; });
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function start(mode) {
	setScreen('game');
	els.loading.hidden = false;
	els.answers.replaceChildren();
	try {
		const map = await loadMap(mode);
		if (!map.pois || map.pois.length < 4) throw new Error('Niet genoeg locaties beschikbaar.');
		state = { mode, map, round: 0, score: 0, streak: 0, best: 0, correct: 0, used: [], locked: false };
		els.modeBadge.textContent = mode === 'og' ? 'FORTNITE OG' : 'BATTLE ROYALE';
		els.mapStatus.textContent = map.live ? 'LIVE GESYNCHRONISEERD' : map.version || 'OG ARCHIEF';
		drawDots();
		nextRound();
	} catch (error) {
		els.loading.innerHTML = `<b>${error.message}</b>`;
		setTimeout(() => setScreen('intro'), 2200);
	}
}

function drawDots() {
	els.roundDots.replaceChildren(...Array.from({ length: TOTAL_ROUNDS }, (_, index) => {
		const dot = document.createElement('i');
		if (index < state.round) dot.className = 'done';
		if (index === state.round) dot.className = 'current';
		return dot;
	}));
}

function placeMap(poi) {
	const image = els.mapImage;
	image.src = state.map.image;
	image.style.transform = 'none';
	const x = Math.max(.06, Math.min(.94, poi.x));
	const y = Math.max(.06, Math.min(.94, poi.y));
	image.style.left = `${50 - x * 420}%`;
	image.style.top = `${50 - y * 420}%`;
	image.onload = () => { els.loading.hidden = true; };
	image.onerror = () => {
		if (state.mode === 'br') {
			image.src = '/dropquiz/og-map.svg';
			image.style.left = '-160%';
			image.style.top = '-160%';
		}
	};
}

function nextRound() {
	if (state.round >= TOTAL_ROUNDS) return finish();
	state.locked = false;
	els.mapWindow.classList.remove('answered');
	els.result.hidden = true;
	els.result.className = 'result';
	els.loading.hidden = !els.mapImage.complete;

	let available = state.map.pois.filter(poi => !state.used.includes(poi.name));
	if (!available.length) {
		state.used = [];
		available = state.map.pois;
	}
	const target = available[Math.floor(Math.random() * available.length)];
	state.used.push(target.name);
	state.target = target;
	const alternatives = shuffle(state.map.pois.filter(poi => poi.name !== target.name)).slice(0, 3);
	const choices = shuffle([target, ...alternatives]);

	els.answers.replaceChildren(...choices.map((poi, index) => {
		const button = document.createElement('button');
		button.className = 'answer';
		button.dataset.name = poi.name;
		const letter = document.createElement('span');
		letter.textContent = String.fromCharCode(65 + index);
		button.append(letter, document.createTextNode(poi.name.toUpperCase()));
		button.addEventListener('click', () => answer(poi.name));
		return button;
	}));
	els.roundNumber.textContent = state.round + 1;
	els.score.textContent = pad(state.score);
	els.streak.textContent = state.streak;
	els.best.textContent = state.best;
	drawDots();
	placeMap(target);
	startTimer();
}

function startTimer() {
	clearInterval(tick);
	const started = performance.now();
	const update = () => {
		const left = Math.max(0, ROUND_SECONDS - (performance.now() - started) / 1000);
		els.timer.textContent = Math.ceil(left);
		els.timerBar.style.width = `${left / ROUND_SECONDS * 100}%`;
		if (!left) answer(null);
	};
	update();
	tick = setInterval(update, 100);
}

function answer(name) {
	if (state.locked) return;
	state.locked = true;
	clearInterval(tick);
	const correct = name === state.target.name;
	const seconds = Number(els.timer.textContent);
	document.querySelectorAll('.answer').forEach(button => {
		button.disabled = true;
		if (button.dataset.name === state.target.name) button.classList.add('correct');
		else if (button.dataset.name === name) button.classList.add('wrong');
	});
	els.mapWindow.classList.add('answered');
	els.result.hidden = false;
	els.result.className = `result show${correct ? '' : ' wrong'}`;
	els.resultIcon.textContent = correct ? '✓' : '×';
	els.resultLabel.textContent = correct ? 'GOED GERADEN' : name ? 'HELAAS, HET WAS' : 'TIJD OM, HET WAS';
	els.resultName.textContent = state.target.name.toUpperCase();
	if (correct) {
		state.correct++;
		state.streak++;
		state.best = Math.max(state.best, state.streak);
		state.score += 500 + seconds * 25 + Math.min(state.streak, 5) * 50;
		beep(740, .13);
	} else {
		state.streak = 0;
		beep(180, .18);
	}
	els.score.textContent = pad(state.score);
	els.streak.textContent = state.streak;
	els.best.textContent = state.best;
	state.round++;
	els.nextButton.textContent = state.round === TOTAL_ROUNDS ? 'RESULTAAT →' : 'VOLGENDE →';
	drawDots();
}

function finish() {
	clearInterval(tick);
	els.finalScore.textContent = pad(state.score);
	els.correctTotal.textContent = `${state.correct} / ${TOTAL_ROUNDS}`;
	els.bestTotal.textContent = state.best;
	setScreen('finish');
	beep(880, .24);
}

document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => start(button.dataset.mode)));
els.answers.addEventListener('keydown', event => {
	const index = ['a', 'b', 'c', 'd'].indexOf(event.key.toLowerCase());
	if (index >= 0) els.answers.children[index]?.click();
});
els.nextButton.addEventListener('click', nextRound);
els.backButton.addEventListener('click', () => { clearInterval(tick); setScreen('intro'); });
els.playAgain.addEventListener('click', () => start(state.mode));
els.soundButton.addEventListener('click', () => {
	audioEnabled = !audioEnabled;
	els.soundButton.textContent = audioEnabled ? '♪' : '×';
	els.soundButton.setAttribute('aria-label', `Geluid ${audioEnabled ? 'aan' : 'uit'}`);
});
