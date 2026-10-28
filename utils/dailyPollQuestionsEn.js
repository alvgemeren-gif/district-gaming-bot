// Five open prompts for 73 activities: a full 365-day English rotation.
const activities = [
	'playing video games', 'cooking', 'reading', 'listening to music', 'watching films',
	'travelling', 'drawing', 'photography', 'gardening', 'baking',
	'playing board games', 'hiking', 'cycling', 'swimming', 'dancing',
	'singing', 'writing stories', 'learning languages', 'playing Minecraft', 'playing Fortnite',
	'playing Roblox', 'solving puzzles', 'camping', 'visiting museums', 'trying new food',
	'making things by hand', 'decorating your room', 'spending time with friends', 'meeting new people', 'learning an instrument',
	'watching live sports', 'playing football', 'playing basketball', 'running', 'doing yoga',
	'collecting things', 'building with LEGO', 'playing card games', 'watching anime', 'reading comics',
	'listening to podcasts', 'watching a series', 'visiting a new city', 'going to the beach', 'walking in nature',
	'looking after animals', 'volunteering', 'organising a party', 'making videos', 'streaming games',
	'learning to code', 'designing a game', 'playing co-op games', 'playing racing games', 'playing adventure games',
	'playing strategy games', 'playing rhythm games', 'playing role-playing games', 'playing retro games', 'playing escape rooms',
	'visiting a theme park', 'going to concerts', 'having a picnic', 'ice skating', 'bowling',
	'playing mini golf', 'stargazing', 'making a playlist', 'trying a new hobby', 'making gifts',
	'exploring your neighbourhood', 'learning something new', 'planning a holiday',
];
const prompts = [
	activity => `What do you enjoy most about ${activity}?`,
	activity => `What advice would you give someone who wants to try ${activity}?`,
	activity => `What would your ideal day of ${activity} look like?`,
	activity => `What would make ${activity} more fun to do with friends?`,
	activity => `What would you like to learn or try next when it comes to ${activity}?`,
];
const englishQuestions = prompts.flatMap(prompt => activities.map(prompt));
module.exports = { englishQuestions };
