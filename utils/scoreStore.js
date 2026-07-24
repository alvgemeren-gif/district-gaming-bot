const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const pool = connectionString
	? new Pool({
		connectionString,
		ssl: process.env.DATABASE_SSL === 'false'
			? false
			: { rejectUnauthorized: false },
	})
	: null;

let schemaPromise;

function requireDatabase() {
	if (!pool) {
		throw new Error('DATABASE_URL is not configured.');
	}

	if (!schemaPromise) {
		schemaPromise = pool.query(`
			CREATE TABLE IF NOT EXISTS match_submissions (
				id BIGSERIAL PRIMARY KEY,
				guild_id TEXT NOT NULL,
				user_id TEXT NOT NULL,
				district_role_id TEXT NOT NULL,
				match_key TEXT NOT NULL,
				submitted_kills INTEGER NOT NULL CHECK (submitted_kills BETWEEN 0 AND 100),
				approved_kills INTEGER,
				screenshot_hash TEXT,
				screenshot_data BYTEA,
				screenshot_mime TEXT,
				screenshot_url TEXT,
				detection_status TEXT NOT NULL CHECK (
					detection_status IN ('not_submitted', 'verified', 'rejected', 'manual_review')
				),
				detection_confidence NUMERIC(5,4),
				detection_note TEXT,
				status TEXT NOT NULL DEFAULT 'pending' CHECK (
					status IN ('pending', 'approved', 'rejected', 'removed')
				),
				victory_awarded BOOLEAN NOT NULL DEFAULT FALSE,
				reviewed_by TEXT,
				review_note TEXT,
				scored_at TIMESTAMPTZ,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE UNIQUE INDEX IF NOT EXISTS match_submission_once
			ON match_submissions (guild_id, user_id, match_key);

			CREATE UNIQUE INDEX IF NOT EXISTS screenshot_once
			ON match_submissions (guild_id, screenshot_hash)
			WHERE screenshot_hash IS NOT NULL;

			CREATE UNIQUE INDEX IF NOT EXISTS victory_once_per_match
			ON match_submissions (guild_id, match_key)
			WHERE status = 'approved' AND victory_awarded = TRUE;

			CREATE TABLE IF NOT EXISTS score_moderation_logs (
				id BIGSERIAL PRIMARY KEY,
				guild_id TEXT NOT NULL,
				submission_id BIGINT,
				actor_id TEXT NOT NULL,
				action TEXT NOT NULL,
				details JSONB NOT NULL DEFAULT '{}'::JSONB,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS live_scoreboards (
				guild_id TEXT PRIMARY KEY,
				channel_id TEXT NOT NULL,
				message_id TEXT NOT NULL,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS monthly_district_winners (
				guild_id TEXT NOT NULL,
				month_key TEXT NOT NULL,
				district_role_id TEXT NOT NULL,
				points INTEGER NOT NULL,
				victories INTEGER NOT NULL,
				kills INTEGER NOT NULL,
				finalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				PRIMARY KEY (guild_id, month_key, district_role_id)
			);

			CREATE TABLE IF NOT EXISTS system_migrations (
				key TEXT PRIMARY KEY,
				applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			ALTER TABLE match_submissions ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ;
			ALTER TABLE monthly_district_winners DROP COLUMN IF EXISTS mission_points;
			UPDATE match_submissions
			SET scored_at = updated_at
			WHERE status = 'approved' AND scored_at IS NULL;

			WITH applied AS (
				INSERT INTO system_migrations (key)
				VALUES ('remove_missions_and_rebuild_winners_v1')
				ON CONFLICT DO NOTHING
				RETURNING key
			)
			DELETE FROM monthly_district_winners
			WHERE EXISTS (SELECT 1 FROM applied);

			DROP TABLE IF EXISTS mission_moderation_logs;
			DROP TABLE IF EXISTS mission_claims;
			DROP TABLE IF EXISTS weekly_missions;
		`);
	}

	return schemaPromise;
}

async function createSubmission(input) {
	await requireDatabase();
	const client = await pool.connect();

	try {
		await client.query('BEGIN');
		const result = await client.query(
			`INSERT INTO match_submissions (
				guild_id, user_id, district_role_id, match_key, submitted_kills,
				screenshot_hash, screenshot_data, screenshot_mime, screenshot_url,
				detection_status, detection_confidence, detection_note
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
			RETURNING *`,
			[
				input.guildId,
				input.userId,
				input.districtRoleId,
				input.matchKey,
				input.kills,
				input.screenshotHash,
				input.screenshotData,
				input.screenshotMime,
				input.screenshotUrl,
				input.detectionStatus,
				input.detectionConfidence,
				input.detectionNote,
			]
		);
		await client.query(
			`INSERT INTO score_moderation_logs
			 (guild_id, submission_id, actor_id, action, details)
			 VALUES ($1, $2, $3, 'submitted', $4)`,
			[
				input.guildId,
				result.rows[0].id,
				input.userId,
				{
					matchKey: input.matchKey,
					kills: input.kills,
					detectionStatus: input.detectionStatus,
				},
			]
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

async function addLog(guildId, submissionId, actorId, action, details = {}) {
	await requireDatabase();
	await pool.query(
		`INSERT INTO score_moderation_logs
		 (guild_id, submission_id, actor_id, action, details)
		 VALUES ($1, $2, $3, $4, $5)`,
		[guildId, submissionId, actorId, action, details]
	);
}

async function getSubmission(guildId, submissionId) {
	await requireDatabase();
	const result = await pool.query(
		'SELECT * FROM match_submissions WHERE guild_id = $1 AND id = $2',
		[guildId, submissionId]
	);
	return result.rows[0] || null;
}

async function getLatestSubmission(guildId, userId) {
	await requireDatabase();
	const result = await pool.query(
		`SELECT * FROM match_submissions
		 WHERE guild_id = $1 AND user_id = $2
		 ORDER BY created_at DESC LIMIT 1`,
		[guildId, userId]
	);
	return result.rows[0] || null;
}

async function getPendingSubmissions(guildId, limit = 10) {
	await requireDatabase();
	const result = await pool.query(
		`SELECT id, user_id, district_role_id, match_key, submitted_kills,
		        screenshot_hash, detection_status, detection_confidence, created_at
		 FROM match_submissions
		 WHERE guild_id = $1 AND status = 'pending'
		 ORDER BY created_at ASC LIMIT $2`,
		[guildId, limit]
	);
	return result.rows;
}

async function approveSubmission(guildId, submissionId, actorId, kills, victory, note, action = 'approved') {
	await requireDatabase();
	const client = await pool.connect();

	try {
		await client.query('BEGIN');
		const current = await client.query(
			`SELECT * FROM match_submissions
			 WHERE guild_id = $1 AND id = $2
			 FOR UPDATE`,
			[guildId, submissionId]
		);
		const submission = current.rows[0];

		if (!submission || submission.status === 'removed') {
			await client.query('ROLLBACK');
			return null;
		}

		if (victory && !submission.screenshot_hash) {
			throw new Error('A Victory Royale requires a stored screenshot.');
		}

		const updated = await client.query(
			`UPDATE match_submissions
			 SET status = 'approved', approved_kills = $3, victory_awarded = $4,
			     reviewed_by = $5, review_note = $6,
			     scored_at = CASE WHEN status = 'approved' THEN scored_at ELSE NOW() END,
			     updated_at = NOW()
			 WHERE guild_id = $1 AND id = $2
			 RETURNING *`,
			[guildId, submissionId, kills, victory, actorId, note || null]
		);
		await client.query(
			`INSERT INTO score_moderation_logs
			 (guild_id, submission_id, actor_id, action, details)
			 VALUES ($1, $2, $3, $4, $5)`,
			[guildId, submissionId, actorId, action, { kills, victory, note: note || null }]
		);
		await client.query('COMMIT');
		return updated.rows[0];
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

async function rejectSubmission(guildId, submissionId, actorId, note) {
	await requireDatabase();
	const result = await pool.query(
		`UPDATE match_submissions
		 SET status = 'rejected', approved_kills = NULL, victory_awarded = FALSE,
		     reviewed_by = $3, review_note = $4, scored_at = NULL, updated_at = NOW()
		 WHERE guild_id = $1 AND id = $2 AND status <> 'removed'
		 RETURNING *`,
		[guildId, submissionId, actorId, note]
	);
	if (result.rows[0]) {
		await addLog(guildId, submissionId, actorId, 'rejected', { note });
	}
	return result.rows[0] || null;
}

async function removeSubmission(guildId, submissionId, actorId, note) {
	await requireDatabase();
	const result = await pool.query(
		`UPDATE match_submissions
		 SET status = 'removed', approved_kills = NULL, victory_awarded = FALSE,
		     reviewed_by = $3, review_note = $4, scored_at = NULL, updated_at = NOW()
		 WHERE guild_id = $1 AND id = $2 AND status <> 'removed'
		 RETURNING *`,
		[guildId, submissionId, actorId, note]
	);
	if (result.rows[0]) {
		await addLog(guildId, submissionId, actorId, 'removed', { note });
	}
	return result.rows[0] || null;
}

async function getScoreboard(guildId) {
	await requireDatabase();
	await finalizePreviousMonths(guildId);
	const result = await pool.query(
		`SELECT district_role_id,
		        COUNT(*) FILTER (WHERE victory_awarded)::INTEGER AS victories,
		        COALESCE(SUM(approved_kills), 0)::INTEGER AS kills,
		        COALESCE(SUM(
		          COALESCE(approved_kills, 0)
		          + CASE WHEN victory_awarded THEN 10 ELSE 0 END
		        ), 0)::INTEGER AS points
		 FROM match_submissions
		 WHERE guild_id = $1
		   AND status = 'approved'
		   AND scored_at >= DATE_TRUNC('month', NOW())
		   AND scored_at < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
		 GROUP BY district_role_id
		 ORDER BY points DESC, victories DESC, kills DESC, district_role_id`,
		[guildId]
	);
	return result.rows;
}

async function finalizePreviousMonths(guildId) {
	await requireDatabase();
	await pool.query(
		`WITH totals AS (
			SELECT month_start, district_role_id,
			       COUNT(*) FILTER (WHERE victory_awarded)::INTEGER AS victories,
			       COALESCE(SUM(approved_kills), 0)::INTEGER AS kills,
			       COALESCE(SUM(
			         COALESCE(approved_kills, 0)
			         + CASE WHEN victory_awarded THEN 10 ELSE 0 END
			       ), 0)::INTEGER AS points
			FROM (
				SELECT DATE_TRUNC('month', scored_at) AS month_start, *
				FROM match_submissions
				WHERE guild_id = $1
				  AND status = 'approved'
				  AND scored_at < DATE_TRUNC('month', NOW())
			) historical_matches
			GROUP BY month_start, district_role_id
		),
		ranked AS (
			SELECT *,
			       DENSE_RANK() OVER (
			         PARTITION BY month_start
			         ORDER BY points DESC, victories DESC, kills DESC
			       ) AS place
			FROM totals
		)
		 INSERT INTO monthly_district_winners (
		   guild_id, month_key, district_role_id, points, victories, kills
		 )
		 SELECT $1, TO_CHAR(month_start, 'YYYY-MM'), district_role_id,
		        points, victories, kills
		 FROM ranked r
		 WHERE place = 1
		   AND NOT EXISTS (
		     SELECT 1 FROM monthly_district_winners w
		     WHERE w.guild_id = $1
		       AND w.month_key = TO_CHAR(r.month_start, 'YYYY-MM')
		   )
		 ON CONFLICT DO NOTHING`,
		[guildId]
	);
}

async function getMonthlyWinners(guildId) {
	await requireDatabase();
	await finalizePreviousMonths(guildId);
	const result = await pool.query(
		`SELECT * FROM monthly_district_winners
		 WHERE guild_id = $1
		 ORDER BY month_key DESC, points DESC, district_role_id`,
		[guildId]
	);
	return result.rows;
}

async function getModerationLogs(guildId, limit = 10) {
	await requireDatabase();
	const result = await pool.query(
		`SELECT * FROM score_moderation_logs
		 WHERE guild_id = $1
		 ORDER BY created_at DESC LIMIT $2`,
		[guildId, limit]
	);
	return result.rows;
}

async function setLiveScoreboard(guildId, channelId, messageId) {
	await requireDatabase();
	await pool.query(
		`INSERT INTO live_scoreboards (guild_id, channel_id, message_id)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (guild_id) DO UPDATE
		 SET channel_id = EXCLUDED.channel_id,
		     message_id = EXCLUDED.message_id,
		     updated_at = NOW()`,
		[guildId, channelId, messageId]
	);
}

async function getLiveScoreboard(guildId) {
	await requireDatabase();
	const result = await pool.query(
		'SELECT channel_id, message_id FROM live_scoreboards WHERE guild_id = $1',
		[guildId]
	);
	return result.rows[0] || null;
}

module.exports = {
	approveSubmission,
	createSubmission,
	getLatestSubmission,
	getScoreboard,
	getLiveScoreboard,
	getMonthlyWinners,
	getModerationLogs,
	getPendingSubmissions,
	getSubmission,
	rejectSubmission,
	removeSubmission,
	setLiveScoreboard,
	pool,
	requireDatabase,
};
