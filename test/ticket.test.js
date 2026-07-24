const assert = require('node:assert/strict');
const test = require('node:test');
const { ticketChannelName } = require('../commands/ticket/ticket');

test('ticket channel names are Discord-safe', () => {
	assert.equal(ticketChannelName('Cozy Hotel!'), 'ticket-cozy-hotel');
	assert.equal(ticketChannelName('---'), 'ticket-member');
	assert.equal(ticketChannelName('Speler_123'), 'ticket-speler-123');
});
