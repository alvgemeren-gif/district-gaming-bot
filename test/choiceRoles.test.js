const assert = require('node:assert/strict');
const test = require('node:test');
const command = require('../commands/rollen/rollen');

test('keuzerollen worden als klikbare knoppen verdeeld', () => {
	const rows = command.buildMemberComponents([
		{ id: '111', name: 'Noord' },
		{ id: '222', name: 'Zuid' },
		{ id: '333', name: 'Oost' },
		{ id: '444', name: 'West' },
		{ id: '555', name: 'Centrum' },
		{ id: '666', name: 'Kust' },
	]).map(row => row.toJSON());

	assert.equal(rows.length, 2);
	assert.equal(rows[0].components.length, 5);
	assert.equal(rows[1].components.length, 1);
	assert.equal(rows[0].components[0].custom_id, 'choice-roles:choose:111');
	assert.equal(rows[0].components[0].label, 'Noord');
	assert.equal(rows[0].components[0].emoji.name, '🎪');
	assert.notEqual(rows[0].components[0].style, rows[0].components[1].style);
});

test('keuzerollenpaneel gebruikt circusstijl en een geuploade afbeelding', () => {
	const embed = command.buildChoiceRoleEmbed('Kies je act!', 'https://example.com/circus.png').toJSON();

	assert.equal(embed.title, '🎪 Welkom in de piste! 🎭');
	assert.equal(embed.color, 0xe63946);
	assert.equal(embed.image.url, 'https://example.com/circus.png');
	assert.match(embed.footer.text, /Kies één act/);
});

test('choice-roles blijft alleen beschikbaar na expliciete toestemming', () => {
	const data = command.data.toJSON();

	assert.equal(data.name, 'choice-roles');
	assert.equal(data.default_member_permissions, '8');
	assert.equal(data.options[0].name, 'text');
	assert.equal(data.options[1].name, 'afbeelding');
	assert.equal(data.options[2].name, 'reset-lid');
});
