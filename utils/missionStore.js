const { pool, requireDatabase } = require('./scoreStore');

function getWeekKey(date = new Date()) {
	const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
	const day = utcDate.getUTCDay() || 7;
	utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
	const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
	const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
	return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function createMission(guildId, title, description, actorId) {
	await requireDatabase();
	const client = await pool.connect();

	try {
		await client.query('BEGIN');
		const result = await client.query(
			`INSERT INTO weekly_missions
			 (guild_id, week_key, title, description, created_by)
			 VALUES ($1, $2, $3, $4, $5)
			 RETURNING *`,
			[guildId, getWeekKey(), title, description, actorId]
		);
		await client.query(
			`INSERT INTO mission_moderation_logs
			 (guild_id, actor_id, action, details)
			 VALUES ($1, $2, 'mission_created', $3)`,
			[guildId, actorId, { missionId: result.rows[0].id, title }]
		);
		await client.query('COMMIT');
		return result.rows[0];
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

async function getWeeklyMissions(guildId, districtRoleId = null) {
	await requireDatabase();
	const result = await pool.query(
		`SELECT m.*,
		        c.id AS claim_id,
		        c.status AS claim_status,
		        c.user_id AS claimed_by
		 FROM weekly_missions m
		 LEFT JOIN mission_claims c
		   ON c.mission_id = m.id
		  AND c.district_role_id = $3
		  AND c.status IN ('pending', 'approved')
		 WHERE m.guild_id = $1 AND m.week_key = $2 AND m.active = TRUE
		 ORDER BY m.id`,
		[guildId, getWeekKey(), districtRoleId]
	);
	return result.rows;
}

async function getMission(guildId, missionId) {
	await requireDatabase();
	const result = await pool.query(
		'SELECT * FROM weekly_missions WHERE guild_id = $1 AND id = $2 AND active = TRUE',
		[guildId, missionId]
	);
	return result.rows[0] || null;
}

async function createMissionClaim(input) {
	await requireDatabase();
	const client = await pool.connect();

	try {
		await client.query('BEGIN');
		const result = await client.query(
			`INSERT INTO mission_claims (
				mission_id, guild_id, user_id, district_role_id,
				proof_hash, proof_data, proof_mime, proof_url, note
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			RETURNING *`,
			[
				input.missionId,
				input.guildId,
				input.userId,
				input.districtRoleId,
				input.proofHash,
				input.proofData,
				input.proofMime,
				input.proofUrl,
				input.note,
			]
		);
		await client.query(
			`INSERT INTO mission_moderation_logs
			 (guild_id, claim_id, actor_id, action, details)
			 VALUES ($1, $2, $3, 'submitted', $4)`,
			[input.guildId, result.rows[0].id, input.userId, { missionId: input.missionId }]
		);
		await client.query('COMMIT');
		return result.rows[0];
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

async function getMissionClaim(guildId, claimId) {
	await requireDatabase();
	const result = await pool.query(
		`SELECT c.*, m.title, m.description, m.week_key, m.points
		 FROM mission_claims c
		 JOIN weekly_missions m ON m.id = c.mission_id
		 WHERE c.guild_id = $1 AND c.id = $2`,
		[guildId, claimId]
	);
	return result.rows[0] || null;
}

async function getPendingMissionClaims(guildId, limit = 10) {
	await requireDatabase();
	const result = await pool.query(
		`SELECT c.id, c.user_id, c.district_role_id, c.created_at,
		        m.id AS mission_id, m.title, m.week_key
		 FROM mission_claims c
		 JOIN weekly_missions m ON m.id = c.mission_id
		 WHERE c.guild_id = $1 AND c.status = 'pending'
		 ORDER BY c.created_at ASC LIMIT $2`,
		[guildId, limit]
	);
	return result.rows;
}

async function moderateMissionClaim(guildId, claimId, actorId, status, note) {
	await requireDatabase();
	const client = await pool.connect();

	try {
		await client.query('BEGIN');
		const result = await client.query(
			`UPDATE mission_claims
			 SET status = $3, reviewed_by = $4, review_note = $5, updated_at = NOW()
			 WHERE guild_id = $1 AND id = $2 AND status <> 'removed'
			 RETURNING *`,
			[guildId, claimId, status, actorId, note]
		);

		if (result.rows[0]) {
			await client.query(
				`INSERT INTO mission_moderation_logs
				 (guild_id, claim_id, actor_id, action, details)
				 VALUES ($1, $2, $3, $4, $5)`,
				[guildId, claimId, actorId, status, { note }]
			);
		}

		await client.query('COMMIT');
		return result.rows[0] || null;
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

async function getMissionLogs(guildId, limit = 10) {
	await requireDatabase();
	const result = await pool.query(
		`SELECT * FROM mission_moderation_logs
		 WHERE guild_id = $1
		 ORDER BY created_at DESC LIMIT $2`,
		[guildId, limit]
	);
	return result.rows;
}

module.exports = {
	createMission,
	createMissionClaim,
	getMission,
	getMissionClaim,
	getMissionLogs,
	getPendingMissionClaims,
	getWeekKey,
	getWeeklyMissions,
	moderateMissionClaim,
};
