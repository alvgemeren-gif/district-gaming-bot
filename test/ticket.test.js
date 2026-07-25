const assert = require('node:assert/strict');
const test = require('node:test');
const { STANDARD_PANELS, panelMessage, ticketChannelName } = require('../commands/ticket/ticket');

test('ticket channel names are Discord-safe', () => {
	assert.equal(ticketChannelName('Cozy Hotel!'), 'ticket-cozy-hotel');
	assert.equal(ticketChannelName('---'), 'ticket-member');
	assert.equal(ticketChannelName('Speler_123'), 'ticket-speler-123');
});

test('standard ticket panels contain the four requested types', () => {
	assert.deepEqual(STANDARD_PANELS.map(panel => panel.title), [
		'Partner',
		'Applications',
		'Help',
		'Questions',
	]);
});

test('ticket panel button opens the stored panel id', () => {
	const message = panelMessage({
		id: 'panel-id',
		title: 'Help',
		description: 'Description',
		buttonLabel: 'Help ticket',
		color: 0xe67e22,
	});
	const button = message.components[0].components[0].toJSON();

	assert.equal(button.custom_id, 'ticket:open:panel-id');
	assert.equal(button.label, 'Help ticket');
});
