const DEFAULT_MAX = 100;
const games = new Map();

function gameKey(guildId, channelId) {
	return `${guildId}:${channelId}`;
}

function randomNumber(max, random = Math.random) {
	return Math.floor(random() * max) + 1;
}

function startGame({ guildId, channelId, hostId, max = DEFAULT_MAX, random = Math.random }) {
	const key = gameKey(guildId, channelId);
	const current = games.get(key);
	if (current) return { status: 'already_active', game: { ...current, answer: undefined } };

	const game = {
		answer: randomNumber(max, random),
		hostId,
		lastPlayerId: null,
		max,
	};
	games.set(key, game);
	return { status: 'started', game: { ...game, answer: undefined } };
}

function guess({ guildId, channelId, number, playerId }) {
	const key = gameKey(guildId, channelId);
	const game = games.get(key);
	if (!game) return { status: 'no_game' };
	if (!Number.isInteger(number) || number < 1 || number > game.max) {
		return { status: 'out_of_range', max: game.max };
	}
	if (game.lastPlayerId === playerId) return { status: 'not_your_turn', max: game.max };
	game.lastPlayerId = playerId;
	if (number === game.answer) {
		games.delete(key);
		return { status: 'correct', answer: game.answer };
	}
	return {
		status: number < game.answer ? 'higher' : 'lower',
		max: game.max,
	};
}

function stopGame({ guildId, channelId }) {
	const key = gameKey(guildId, channelId);
	const game = games.get(key);
	if (!game) return null;
	games.delete(key);
	return game;
}

function getGame({ guildId, channelId }) {
	const key = gameKey(guildId, channelId);
	const game = games.get(key);
	return game || null;
}

function clearGames() {
	games.clear();
}

module.exports = {
	DEFAULT_MAX,
	clearGames,
	getGame,
	guess,
	randomNumber,
	startGame,
	stopGame,
};
