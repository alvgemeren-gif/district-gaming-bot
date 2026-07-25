const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeNews, versionFromBuild } = require('../utils/fortniteUpdates');

test('Fortnite news filters hidden entries and sorts priority first', () => {
	const news = normalizeNews({
		motds: [
			{ id: 'low', title: 'Low', body: 'Later', sortingPriority: 1, hidden: false },
			{ id: 'hidden', title: 'Hidden', sortingPriority: 100, hidden: true },
			{ id: 'high', title: 'High', body: 'First', sortingPriority: 50, hidden: false },
		],
	});
	assert.deepEqual(news.map(item => item.id), ['high', 'low']);
});

test('Fortnite build strings become readable versions', () => {
	assert.equal(versionFromBuild('++Fortnite+Release-41.20-CL-55550516'), 'v41.20');
	assert.equal(versionFromBuild(''), 'nieuwe versie');
});
