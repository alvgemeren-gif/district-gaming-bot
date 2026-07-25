const glyphNames = ['pulse', 'facet', 'drift', 'flare'];
let data;
let activeBoard = 'daily';

function glyph(value) {
	const node = document.createElement('span');
	node.className = `glyph g${value} c${value}`;
	node.setAttribute('aria-label', glyphNames[value]);
	return node;
}

function showPuzzle(puzzle) {
	const matrix = document.querySelector('#matrix');
	const options = document.querySelector('#options');
	matrix.replaceChildren();
	options.replaceChildren();
	puzzle.cells.forEach(value => {
		const cell = document.createElement('div');
		cell.className = `cell${value === null ? ' missing' : ''}`;
		if (value === null) cell.textContent = '?';
		else cell.append(glyph(value));
		matrix.append(cell);
	});
	puzzle.options.forEach(value => {
		const button = document.createElement('button');
		button.className = 'option';
		button.setAttribute('aria-label', glyphNames[value]);
		button.append(glyph(value));
		button.addEventListener('click', () => answer(value));
		options.append(button);
	});
}

function updateAttempt() {
	const attempt = data.attempt;
	document.querySelector('#day').textContent = attempt.challengeKey;
	document.querySelector('#progress').textContent = `${attempt.round} / ${attempt.roundCount} repaired`;
	document.querySelector('#roundLabel').textContent = `SIGNAL ${String(Math.min(attempt.round + 1, 5)).padStart(2, '0')} / 05`;
	document.querySelector('#accuracy').textContent = `${attempt.correctCount} correct`;
	if (attempt.completed) {
		document.querySelector('#game').hidden = true;
		document.querySelector('#complete').hidden = false;
		document.querySelector('#score').textContent = attempt.performanceScore;
		document.querySelector('#points').textContent = `+${attempt.districtPoints}`;
		document.querySelector('#correct').textContent = `${attempt.correctCount}/5`;
		document.querySelector('#resultTitle').textContent = attempt.correctCount === 5 ? 'A flawless weave.' : 'Signal secured.';
	} else {
		showPuzzle(data.puzzle);
	}
}

async function answer(value) {
	document.querySelectorAll('.option').forEach(button => { button.disabled = true; });
	const feedback = document.querySelector('#feedback');
	try {
		const response = await fetch('/daily/api/answer', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ answer: value }),
		});
		const result = await response.json();
		if (!response.ok) throw new Error(result.error);
		feedback.textContent = result.correct ? 'Signal aligned.' : 'Interference detected.';
		feedback.className = `feedback ${result.correct ? 'good' : 'bad'}`;
		data.attempt = result.attempt;
		data.puzzle = result.puzzle;
		setTimeout(() => { feedback.textContent = ''; updateAttempt(); if (data.attempt.completed) location.reload(); }, 650);
	} catch (error) {
		feedback.textContent = error.message;
		feedback.className = 'feedback bad';
		document.querySelectorAll('.option').forEach(button => { button.disabled = false; });
	}
}

function showBoard() {
	const rows = data.leaderboards[activeBoard];
	const list = document.querySelector('#leaderboard');
	list.replaceChildren();
	if (!rows.length) {
		const empty = document.createElement('li');
		empty.className = 'empty';
		empty.textContent = 'No completed signals yet. Set the pace.';
		list.append(empty);
		return;
	}
	rows.forEach(row => {
		const item = document.createElement('li');
		const name = document.createElement('span');
		name.textContent = row.username;
		const detail = document.createElement('small');
		detail.textContent = activeBoard === 'daily' ? `${row.correct_count}/5 · +${row.district_points} district` : `${row.plays} plays · ${row.correct_count} repairs`;
		name.append(detail);
		const score = document.createElement('strong');
		score.textContent = Number(row.performance_score).toLocaleString();
		item.append(name, score);
		list.append(item);
	});
}

document.querySelectorAll('[data-board]').forEach(button => button.addEventListener('click', () => {
	activeBoard = button.dataset.board;
	document.querySelectorAll('[data-board]').forEach(tab => tab.classList.toggle('active', tab === button));
	showBoard();
}));

fetch('/daily/api/state').then(async response => {
	if (response.status === 401) {
		throw new Error('Je hebt een geldige persoonlijke spellink nodig om veilig in te loggen.');
	}
	const result = await response.json();
	if (!response.ok) throw new Error(result.error);
	return result;
}).then(result => {
	if (!result) return;
	data = result;
	document.querySelector('#identity').textContent = `${data.player.username} · ${data.player.district}`;
	updateAttempt();
	showBoard();
}).catch(error => {
	document.querySelector('#identity').textContent = 'Unavailable';
	const message = document.createElement('p');
	message.className = 'feedback bad';
	message.textContent = error.message;
	document.querySelector('#game').replaceChildren(message);
});
