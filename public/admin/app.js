const guildSelect = document.querySelector('#guild');
const statusSelect = document.querySelector('#status');
const container = document.querySelector('#submissions');
const message = document.querySelector('#message');

async function api(url, options) {
	const response = await fetch(url, options);
	const data = await response.json();
	if (response.status === 401) {
		location.href = '/admin/login';
		throw new Error('Your session has expired.');
	}
	if (!response.ok) throw new Error(data.error || 'The action failed.');
	return data;
}

function setMessage(text, isError = false) {
	message.textContent = text;
	message.style.color = isError ? 'var(--red)' : 'var(--gold)';
}

async function loadGuilds() {
	const { guilds } = await api('/admin/api/guilds');
	guildSelect.replaceChildren(...guilds.map(guild => {
		const option = document.createElement('option');
		option.value = guild.id;
		option.textContent = guild.name;
		return option;
	}));
}

function describeAi(item) {
	if (item.detection_status === 'not_submitted') {
		return { badge: 'no screenshot', tone: 'idle', summary: 'Kill-only submission, nothing for the AI to check.' };
	}
	if (item.ai_predicted_victory === null || item.ai_predicted_victory === undefined) {
		return { badge: 'unavailable', tone: 'idle', summary: 'The AI could not judge this screenshot.' };
	}

	// Floor, never round: 99.5% must not read as 100% next to the 99% auto-approve threshold.
	const percent = Number(item.detection_confidence) * 100;
	const confidence = item.detection_confidence === null
		? 'unknown confidence'
		: `${Math.floor(percent * 10) / 10}% confident`;
	const kills = Number.isInteger(item.ai_predicted_kills) ? `${item.ai_predicted_kills} kills` : 'kills unreadable';
	const crown = item.ai_predicted_crown ? ', Crown Victory' : '';

	return {
		badge: item.ai_predicted_victory ? 'victory' : 'no victory',
		tone: item.ai_predicted_victory ? 'yes' : 'no',
		summary: `${item.ai_predicted_victory ? 'Victory Royale' : 'No Victory Royale'} · ${kills}${crown} · ${confidence}`,
	};
}

function buildCard(item) {
	const card = document.querySelector('#card').content.firstElementChild.cloneNode(true);
	card.querySelector('.submission-id').textContent = `SUBMISSION #${item.id}`;
	card.querySelector('.player').textContent = item.player_name;
	card.querySelector('.district').textContent = item.district_name;
	card.querySelector('.submitted-kills').textContent = item.submitted_kills;
	card.querySelector('.claimed-win').textContent = item.claimed_victory ? 'Yes' : 'No';
	card.querySelector('.detection').textContent = item.detection_status.replaceAll('_', ' ');
	card.querySelector('.date').textContent = new Intl.DateTimeFormat('en-GB', {dateStyle:'medium',timeStyle:'short'}).format(new Date(item.created_at));
	const badge = card.querySelector('.badge');
	badge.textContent = item.auto_approved ? 'approved by ai' : item.status;
	badge.classList.add(item.status);

	const ai = describeAi(item);
	const aiBadge = card.querySelector('.ai-badge');
	aiBadge.textContent = ai.badge;
	aiBadge.classList.add(ai.tone);
	card.querySelector('.ai-summary').textContent = ai.summary;
	const reason = card.querySelector('.ai-reason');
	if (item.detection_note) reason.textContent = `“${item.detection_note}”`;
	else reason.hidden = true;
	card.querySelector('.ai-conflict').hidden = !item.ai_disagrees_with_player;

	const proof = card.querySelector('.proof');
	if (item.has_screenshot) {
		proof.hidden = false;
		proof.src = `/admin/api/submissions/${item.id}/screenshot?guildId=${encodeURIComponent(item.guild_id)}`;
	}
	const decision = card.querySelector('.decision');
	if (item.status !== 'pending') decision.hidden = true;
	const kills = card.querySelector('.kills');
	kills.value = item.submitted_kills;
	const victory = card.querySelector('.victory');
	victory.checked = item.claimed_victory || item.detection_status === 'verified';
	const crownVictory = card.querySelector('.crown-victory');
	crownVictory.checked = Boolean(item.crown_victory_awarded);
	crownVictory.addEventListener('change', () => {
		if (crownVictory.checked) victory.checked = true;
	});
	victory.addEventListener('change', () => {
		if (!victory.checked) crownVictory.checked = false;
	});
	const note = card.querySelector('.note');

	async function decide(action) {
		setMessage(`Processing submission #${item.id}…`);
		card.querySelectorAll('button').forEach(button => button.disabled = true);
		try {
			await api(`/admin/api/submissions/${item.id}/${action}`, {
				method: 'POST',
				headers: {'Content-Type':'application/json'},
				body: JSON.stringify({
					guildId: item.guild_id,
					kills: Number(kills.value),
					victory: victory.checked,
					crownVictory: crownVictory.checked,
					note: note.value,
				}),
			});
			setMessage(`Submission #${item.id} was ${action === 'approve' ? 'approved' : 'rejected'}.`);
			await loadSubmissions();
		} catch (error) {
			setMessage(error.message, true);
			card.querySelectorAll('button').forEach(button => button.disabled = false);
		}
	}
	card.querySelector('.approve').addEventListener('click', () => decide('approve'));
	card.querySelector('.reject').addEventListener('click', () => decide('reject'));
	return card;
}

function renderAiStats(stats) {
	const value = document.querySelector('#ai-accuracy');
	const label = document.querySelector('#ai-accuracy-label');
	const mode = document.querySelector('#ai-mode');

	if (!stats) {
		value.textContent = '—';
		label.textContent = 'AI accuracy';
		mode.textContent = '';
		return;
	}

	value.textContent = stats.accuracy === null ? '—' : `${Math.floor(stats.accuracy * 1000) / 10}%`;
	label.textContent = `AI accuracy (${stats.sampleSize}/${stats.minSample} reviewed)`;

	const accurate = stats.accuracy !== null && stats.accuracy >= stats.minAccuracy;
	if (stats.sampleSize >= stats.minSample && accurate) {
		mode.textContent = `Auto-approval is ACTIVE. High-confidence victories are approved without review; corrections through the dashboard still feed back into this score.`;
		mode.className = 'ai-mode live';
	} else {
		const missing = Math.max(stats.minSample - stats.sampleSize, 0);
		mode.textContent = `Shadow mode: nothing is auto-approved yet. ${missing > 0 ? `${missing} more human-reviewed high-confidence victories needed` : `accuracy must reach ${Math.round(stats.minAccuracy * 100)}%`} before the AI may approve on its own.`;
		mode.className = 'ai-mode shadow';
	}
}

async function loadSubmissions() {
	if (!guildSelect.value) return;
	setMessage('Loading…');
	try {
		const query = new URLSearchParams({guildId:guildSelect.value,status:statusSelect.value});
		const { submissions, aiStats } = await api(`/admin/api/submissions?${query}`);
		container.replaceChildren(...submissions.map(buildCard));
		document.querySelector('#total').textContent = submissions.length;
		document.querySelector('#pending').textContent = submissions.filter(item => item.status === 'pending').length;
		document.querySelector('#empty').hidden = submissions.length > 0;
		renderAiStats(aiStats);
		setMessage('');
	} catch (error) {
		setMessage(error.message, true);
	}
}

guildSelect.addEventListener('change', loadSubmissions);
statusSelect.addEventListener('change', loadSubmissions);
document.querySelector('#refresh').addEventListener('click', loadSubmissions);

loadGuilds().then(loadSubmissions).catch(error => setMessage(error.message, true));
