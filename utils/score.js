function calculatePoints(kills, victoryAwarded = false) {
	const approvedKills = Number(kills);

	if (!Number.isInteger(approvedKills) || approvedKills < 0) {
		throw new TypeError('Approved kills must be a non-negative integer.');
	}

	return approvedKills + (victoryAwarded ? 10 : 0);
}

module.exports = {
	calculatePoints,
};
