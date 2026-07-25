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
	badge.textContent = item.status;
	badge.classList.add(item.status);
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

async function loadSubmissions() {
	if (!guildSelect.value) return;
	setMessage('Loading…');
	try {
		const query = new URLSearchParams({guildId:guildSelect.value,status:statusSelect.value});
		const { submissions } = await api(`/admin/api/submissions?${query}`);
		container.replaceChildren(...submissions.map(buildCard));
		document.querySelector('#total').textContent = submissions.length;
		document.querySelector('#pending').textContent = submissions.filter(item => item.status === 'pending').length;
		document.querySelector('#empty').hidden = submissions.length > 0;
		setMessage('');
	} catch (error) {
		setMessage(error.message, true);
	}
}

guildSelect.addEventListener('change', loadSubmissions);
statusSelect.addEventListener('change', loadSubmissions);
document.querySelector('#refresh').addEventListener('click', loadSubmissions);

loadGuilds().then(loadSubmissions).catch(error => setMessage(error.message, true));
