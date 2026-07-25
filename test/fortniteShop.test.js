const test = require('node:test');
const assert = require('node:assert/strict');
const { messagePayloads, normalizeShop } = require('../utils/fortniteShop');

test('Fortnite shop entries retain names, prices, sections and images', () => {
	const shop = normalizeShop({
		data: {
			hash: 'today',
			entries: [{
				offerId: 'offer-1',
				finalPrice: 1200,
				regularPrice: 1500,
				layout: { name: 'Uitgelicht' },
				items: [{ name: 'Cozy Ranger', type: { value: 'outfit' }, images: { icon: 'https://example.com/item.png' } }],
			}],
		},
	});
	assert.equal(shop.entries[0].name, 'Cozy Ranger');
	assert.equal(shop.entries[0].price, 1200);
	assert.equal(shop.entries[0].regularPrice, 1500);
	assert.equal(shop.entries[0].section, 'Uitgelicht');
	assert.equal(shop.entries[0].image, 'https://example.com/item.png');
	assert.equal(shop.entries[0].category, 'Skins');
});

test('large shops are divided over Discord-safe messages', () => {
	const entries = Array.from({ length: 23 }, (_, index) => ({
		id: String(index),
		name: `Item ${index}`,
		price: 500,
		regularPrice: 500,
		image: null,
		section: 'Dagelijks',
		category: 'Skins',
		items: 1,
		banner: null,
	}));
	const payloads = messagePayloads({ entries, hash: 'large' });
	assert.equal(payloads.length, 3);
	assert.deepEqual(payloads.map(payload => payload.embeds.length), [10, 10, 3]);
	assert.ok(payloads.every(payload => payload.components.length === 0));
	assert.match(payloads[0].content, /Skins · 23/);
});

test('Jam Tracks use their public title and artist', () => {
	const shop = normalizeShop({
		data: {
			entries: [{
				offerId: 'track-1',
				finalPrice: 500,
				tracks: [{ title: 'Taste', artist: 'Sabrina Carpenter', albumArt: 'https://example.com/cover.jpg' }],
			}],
		},
	});
	assert.equal(shop.entries[0].name, 'Taste — Sabrina Carpenter');
	assert.equal(shop.entries[0].image, 'https://example.com/cover.jpg');
	assert.equal(shop.entries[0].category, 'Muziek');
});

test('shop categories appear in a predictable item-type order', () => {
	const shop = normalizeShop({
		data: {
			entries: [
				{ offerId: 'track', finalPrice: 500, tracks: [{ title: 'Song' }] },
				{ offerId: 'dance', finalPrice: 500, brItems: [{ name: 'Dance', type: { value: 'emote' } }] },
				{ offerId: 'skin', finalPrice: 1500, brItems: [{ name: 'Skin', type: { value: 'outfit' } }] },
			],
		},
	});
	assert.deepEqual(shop.entries.map(entry => entry.category), ['Skins', 'Dansjes & emotes', 'Muziek']);
	assert.deepEqual(messagePayloads(shop).map(payload => payload.content.match(/## ([^·]+)/)?.[1].trim()), [
		'Skins',
		'Dansjes & emotes',
		'Muziek',
	]);
});
