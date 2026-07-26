function calculatePoints(kills, victoryAwarded = false, crownVictoryAwarded = false) {
	const approvedKills = Number(kills);

	if (!Number.isInteger(approvedKills) || approvedKills < 0) {
		throw new TypeError('Approved kills must be a non-negative integer.');
	}

	if (crownVictoryAwarded && !victoryAwarded) {
		throw new TypeError('A Crown Victory also requires a Victory Royale.');
	}

	return approvedKills + (victoryAwarded ? 10 : 0) + (crownVictoryAwarded ? 5 : 0);
}

module.exports = {
	calculatePoints,
};
