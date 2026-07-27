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
				claimed_victory BOOLEAN NOT NULL DEFAULT FALSE,
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
				crown_victory_awarded BOOLEAN NOT NULL DEFAULT FALSE,
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

			CREATE TABLE IF NOT EXISTS live_player_leaderboards (
				guild_id TEXT PRIMARY KEY,
				channel_id TEXT NOT NULL,
				message_id TEXT NOT NULL,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS live_monthly_leaderboards (
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

			CREATE TABLE IF NOT EXISTS monthly_player_stats (
				guild_id TEXT NOT NULL,
				month_key TEXT NOT NULL,
				user_id TEXT NOT NULL,
				victories INTEGER NOT NULL,
				kills INTEGER NOT NULL,
				points INTEGER NOT NULL,
				win_rank INTEGER NOT NULL,
				kill_rank INTEGER NOT NULL,
				finalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				PRIMARY KEY (guild_id, month_key, user_id)
			);

			CREATE TABLE IF NOT EXISTS system_migrations (
				key TEXT PRIMARY KEY,
				applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS daily_game_attempts (
				id BIGSERIAL PRIMARY KEY,
				guild_id TEXT NOT NULL,
				user_id TEXT NOT NULL,
				username TEXT NOT NULL,
				district_role_id TEXT NOT NULL,
				challenge_key DATE NOT NULL,
				answers JSONB NOT NULL DEFAULT '[]'::JSONB,
				correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count BETWEEN 0 AND 5),
				performance_score INTEGER,
				district_points INTEGER,
				started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				completed_at TIMESTAMPTZ,
				UNIQUE (guild_id, user_id, challenge_key)
			);
			CREATE INDEX IF NOT EXISTS daily_game_daily_rank
			ON daily_game_attempts (guild_id, challenge_key, performance_score DESC)
			WHERE completed_at IS NOT NULL;

			ALTER TABLE match_submissions ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ;
			ALTER TABLE match_submissions ADD COLUMN IF NOT EXISTS claimed_victory BOOLEAN NOT NULL DEFAULT FALSE;
			ALTER TABLE match_submissions ADD COLUMN IF NOT EXISTS crown_victory_awarded BOOLEAN NOT NULL DEFAULT FALSE;
			ALTER TABLE match_submissions ADD COLUMN IF NOT EXISTS ai_predicted_victory BOOLEAN;
			ALTER TABLE match_submissions ADD COLUMN IF NOT EXISTS ai_predicted_kills INTEGER;
			ALTER TABLE match_submissions ADD COLUMN IF NOT EXISTS ai_predicted_crown BOOLEAN;
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
				guild_id, user_id, district_role_id, match_key, submitted_kills, claimed_victory,
				screenshot_hash, screenshot_data, screenshot_mime, screenshot_url,
				detection_status, detection_confidence, detection_note,
				ai_predicted_victory, ai_predicted_kills, ai_predicted_crown
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
			RETURNING *`,
			[
				input.guildId,
				input.userId,
				input.districtRoleId,
				input.matchKey,
				input.kills,
				Boolean(input.claimedVictory),
				input.screenshotHash,
				input.screenshotData,
				input.screenshotMime,
				input.screenshotUrl,
				input.detectionStatus,
				input.detectionConfidence,
				input.detectionNote,
				input.aiPredictedVictory ?? null,
				input.aiPredictedKills ?? null,
				input.aiPredictedCrown ?? null,
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
					claimedVictory: Boolean(input.claimedVictory),
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
		`SELECT id, user_id, district_role_id, match_key, submitted_kills, claimed_victory,
		        screenshot_hash, detection_status, detection_confidence, created_at
		 FROM match_submissions
		 WHERE guild_id = $1 AND status = 'pending'
		 ORDER BY created_at ASC LIMIT $2`,
		[guildId, limit]
	);
	return result.rows;
}

async function getDashboardSubmissions(guildId, status = 'all', limit = 100) {
	await requireDatabase();
	const values = [guildId, Math.min(Math.max(Number(limit) || 100, 1), 200)];
	const statusFilter = status === 'all' ? '' : ' AND status = $3';

	if (status !== 'all') {
		values.push(status);
	}

	const result = await pool.query(
		`SELECT id, guild_id, user_id, district_role_id, match_key, submitted_kills, claimed_victory,
		        approved_kills, screenshot_hash, screenshot_mime, detection_status,
		        detection_confidence, detection_note, status, victory_awarded, crown_victory_awarded,
		        reviewed_by, review_note, scored_at, created_at, updated_at
		 FROM match_submissions
		 WHERE guild_id = $1${statusFilter}
		 ORDER BY
		   CASE status WHEN 'pending' THEN 0 ELSE 1 END,
		   created_at DESC
		 LIMIT $2`,
		values
	);
	return result.rows;
}

async function approveSubmission(guildId, submissionId, actorId, kills, victory, note, action = 'approved', crownVictory = false) {
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
		if (crownVictory && !victory) {
			throw new Error('A Crown Victory also requires a Victory Royale.');
		}

		const updated = await client.query(
			`UPDATE match_submissions
			 SET status = 'approved', approved_kills = $3, victory_awarded = $4,
			     crown_victory_awarded = $5, reviewed_by = $6, review_note = $7,
			     scored_at = CASE WHEN status = 'approved' THEN scored_at ELSE NOW() END,
			     updated_at = NOW()
			 WHERE guild_id = $1 AND id = $2
			 RETURNING *`,
			[guildId, submissionId, kills, victory, crownVictory, actorId, note || null]
		);
		await client.query(
			`INSERT INTO score_moderation_logs
			 (guild_id, submission_id, actor_id, action, details)
			 VALUES ($1, $2, $3, $4, $5)`,
			[guildId, submissionId, actorId, action, { kills, victory, crownVictory, note: note || null }]
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
		 SET status = 'rejected', approved_kills = NULL, victory_awarded = FALSE, crown_victory_awarded = FALSE,
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
		 SET status = 'removed', approved_kills = NULL, victory_awarded = FALSE, crown_victory_awarded = FALSE,
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

const AI_AUTO_ACTOR = 'ai-auto';

async function getVerificationAccuracy(guildId, sampleSize = 100) {
	await requireDatabase();
	const limit = Math.min(Math.max(Number(sampleSize) || 100, 1), 500);
	const result = await pool.query(
		`WITH sample AS (
			SELECT ai_predicted_victory, ai_predicted_kills, ai_predicted_crown,
			       status, victory_awarded, approved_kills, crown_victory_awarded
			FROM match_submissions
			WHERE guild_id = $1
			  AND status IN ('approved', 'rejected')
			  AND reviewed_by IS NOT NULL
			  AND reviewed_by <> $2
			  AND ai_predicted_victory IS TRUE
			  AND detection_confidence >= 0.99
			ORDER BY updated_at DESC
			LIMIT $3
		)
		SELECT
			COUNT(*)::INTEGER AS sample_size,
			COUNT(*) FILTER (
				WHERE status = 'approved'
				  AND victory_awarded IS TRUE
				  AND approved_kills IS NOT DISTINCT FROM ai_predicted_kills
				  AND crown_victory_awarded IS NOT DISTINCT FROM ai_predicted_crown
			)::INTEGER AS correct
		FROM sample`,
		[guildId, AI_AUTO_ACTOR, limit]
	);
	const row = result.rows[0] || { sample_size: 0, correct: 0 };
	const sample = Number(row.sample_size) || 0;
	const correct = Number(row.correct) || 0;
	return {
		sampleSize: sample,
		correct,
		accuracy: sample > 0 ? correct / sample : null,
	};
}

async function getScoreboard(guildId) {
	await requireDatabase();
	await finalizePreviousMonths(guildId);
	const result = await pool.query(
		`WITH match_points AS (
			SELECT district_role_id,
			       COUNT(*) FILTER (WHERE victory_awarded)::INTEGER AS victories,
			       COALESCE(SUM(approved_kills), 0)::INTEGER AS kills,
			       COALESCE(SUM(COALESCE(approved_kills, 0) + CASE WHEN victory_awarded THEN 10 ELSE 0 END + CASE WHEN crown_victory_awarded THEN 5 ELSE 0 END), 0)::INTEGER AS points
			FROM match_submissions
			WHERE guild_id = $1 AND status = 'approved'
			  AND scored_at >= DATE_TRUNC('month', NOW())
			  AND scored_at < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
			GROUP BY district_role_id
		), game_points AS (
			SELECT district_role_id, COALESCE(SUM(district_points), 0)::INTEGER AS points
			FROM daily_game_attempts
			WHERE guild_id = $1 AND completed_at >= DATE_TRUNC('month', NOW())
			  AND completed_at < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
			GROUP BY district_role_id
		), districts AS (
			SELECT district_role_id FROM match_points UNION SELECT district_role_id FROM game_points
		)
		SELECT districts.district_role_id, COALESCE(match_points.victories, 0)::INTEGER AS victories,
		       COALESCE(match_points.kills, 0)::INTEGER AS kills,
		       (COALESCE(match_points.points, 0) + COALESCE(game_points.points, 0))::INTEGER AS points
		FROM districts
		LEFT JOIN match_points USING (district_role_id)
		LEFT JOIN game_points USING (district_role_id)
		ORDER BY points DESC, victories DESC, kills DESC, district_role_id`,
		[guildId]
	);
	return result.rows;
}

async function finalizePreviousMonths(guildId) {
	await requireDatabase();
	await pool.query(
		`WITH sources AS (
			SELECT DATE_TRUNC('month', scored_at) AS month_start, district_role_id,
			       CASE WHEN victory_awarded THEN 1 ELSE 0 END AS victories,
			       COALESCE(approved_kills, 0) AS kills,
			       COALESCE(approved_kills, 0) + CASE WHEN victory_awarded THEN 10 ELSE 0 END + CASE WHEN crown_victory_awarded THEN 5 ELSE 0 END AS points
			FROM match_submissions
			WHERE guild_id = $1 AND status = 'approved'
			  AND scored_at < DATE_TRUNC('month', NOW())
			UNION ALL
			SELECT DATE_TRUNC('month', completed_at), district_role_id, 0, 0, district_points
			FROM daily_game_attempts
			WHERE guild_id = $1 AND completed_at IS NOT NULL
			  AND completed_at < DATE_TRUNC('month', NOW())
		), totals AS (
			SELECT month_start, district_role_id, SUM(victories)::INTEGER AS victories,
			       SUM(kills)::INTEGER AS kills, SUM(points)::INTEGER AS points
			FROM sources GROUP BY month_start, district_role_id
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
	await pool.query(
		`WITH totals AS (
			SELECT DATE_TRUNC('month', scored_at) AS month_start,
			       user_id,
			       COUNT(*) FILTER (WHERE victory_awarded)::INTEGER AS victories,
			       COALESCE(SUM(approved_kills), 0)::INTEGER AS kills,
			       COALESCE(SUM(
			         COALESCE(approved_kills, 0)
			         + CASE WHEN victory_awarded THEN 10 ELSE 0 END
			         + CASE WHEN crown_victory_awarded THEN 5 ELSE 0 END
			       ), 0)::INTEGER AS points
			FROM match_submissions
			WHERE guild_id = $1
			  AND status = 'approved'
			  AND scored_at < DATE_TRUNC('month', NOW())
			GROUP BY DATE_TRUNC('month', scored_at), user_id
		),
		ranked AS (
			SELECT *,
			       DENSE_RANK() OVER (
			         PARTITION BY month_start ORDER BY victories DESC
			       )::INTEGER AS win_rank,
			       DENSE_RANK() OVER (
			         PARTITION BY month_start ORDER BY kills DESC
			       )::INTEGER AS kill_rank
			FROM totals
		)
		INSERT INTO monthly_player_stats (
		  guild_id, month_key, user_id, victories, kills, points, win_rank, kill_rank
		)
		SELECT $1, TO_CHAR(month_start, 'YYYY-MM'), user_id,
		       victories, kills, points, win_rank, kill_rank
		FROM ranked
		ON CONFLICT (guild_id, month_key, user_id) DO NOTHING`,
		[guildId]
	);
}

async function getCurrentPlayerScoreboard(guildId) {
	await requireDatabase();
	await finalizePreviousMonths(guildId);
	const result = await pool.query(
		`SELECT user_id,
		        COUNT(*) FILTER (WHERE victory_awarded)::INTEGER AS victories,
		        COALESCE(SUM(approved_kills), 0)::INTEGER AS kills,
		        COALESCE(SUM(
		          COALESCE(approved_kills, 0)
		          + CASE WHEN victory_awarded THEN 10 ELSE 0 END
		          + CASE WHEN crown_victory_awarded THEN 5 ELSE 0 END
		        ), 0)::INTEGER AS points
		 FROM match_submissions
		 WHERE guild_id = $1
		   AND status = 'approved'
		   AND scored_at >= DATE_TRUNC('month', NOW())
		   AND scored_at < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
		 GROUP BY user_id
		 ORDER BY points DESC, victories DESC, kills DESC, user_id`,
		[guildId]
	);
	return result.rows;
}

async function getPlayerMonthlyHistory(guildId) {
	await requireDatabase();
	await finalizePreviousMonths(guildId);
	const result = await pool.query(
		`SELECT user_id,
		        SUM(victories)::INTEGER AS victories,
		        SUM(kills)::INTEGER AS kills,
		        SUM(points)::INTEGER AS points,
		        COUNT(*)::INTEGER AS months_played,
		        COUNT(*) FILTER (WHERE win_rank = 1)::INTEGER AS monthly_win_titles,
		        COUNT(*) FILTER (WHERE kill_rank = 1)::INTEGER AS monthly_kill_titles
		 FROM monthly_player_stats
		 WHERE guild_id = $1
		 GROUP BY user_id
		 ORDER BY victories DESC, kills DESC, points DESC, user_id`,
		[guildId]
	);
	return result.rows;
}

async function getPlayerMonthlyWinners(guildId, limit = 100) {
	await requireDatabase();
	await finalizePreviousMonths(guildId);
	const result = await pool.query(
		`SELECT month_key, user_id, victories, kills, points, win_rank, kill_rank
		 FROM monthly_player_stats
		 WHERE guild_id = $1
		   AND (win_rank = 1 OR kill_rank = 1)
		 ORDER BY month_key DESC, win_rank, kill_rank, user_id
		 LIMIT $2`,
		[guildId, Math.min(Math.max(Number(limit) || 100, 1), 100)]
	);
	return result.rows;
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

async function setLivePlayerLeaderboard(guildId, channelId, messageId) {
	await requireDatabase();
	await pool.query(
		`INSERT INTO live_player_leaderboards (guild_id, channel_id, message_id)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (guild_id) DO UPDATE
		 SET channel_id = EXCLUDED.channel_id,
		     message_id = EXCLUDED.message_id,
		     updated_at = NOW()`,
		[guildId, channelId, messageId]
	);
}

async function getLivePlayerLeaderboard(guildId) {
	await requireDatabase();
	const result = await pool.query(
		'SELECT channel_id, message_id FROM live_player_leaderboards WHERE guild_id = $1',
		[guildId]
	);
	return result.rows[0] || null;
}

async function setLiveMonthlyLeaderboard(guildId, channelId, messageId) {
	await requireDatabase();
	await pool.query(
		`INSERT INTO live_monthly_leaderboards (guild_id, channel_id, message_id)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (guild_id) DO UPDATE
		 SET channel_id = EXCLUDED.channel_id,
		     message_id = EXCLUDED.message_id,
		     updated_at = NOW()`,
		[guildId, channelId, messageId]
	);
}

async function getLiveMonthlyLeaderboard(guildId) {
	await requireDatabase();
	const result = await pool.query(
		'SELECT channel_id, message_id FROM live_monthly_leaderboards WHERE guild_id = $1',
		[guildId]
	);
	return result.rows[0] || null;
}

module.exports = {
	approveSubmission,
	createSubmission,
	getLatestSubmission,
	getDashboardSubmissions,
	getCurrentPlayerScoreboard,
	getPlayerMonthlyHistory,
	getPlayerMonthlyWinners,
	getScoreboard,
	getLiveScoreboard,
	getLivePlayerLeaderboard,
	getLiveMonthlyLeaderboard,
	getMonthlyWinners,
	getModerationLogs,
	getPendingSubmissions,
	getSubmission,
	getVerificationAccuracy,
	AI_AUTO_ACTOR,
	rejectSubmission,
	removeSubmission,
	setLiveScoreboard,
	setLivePlayerLeaderboard,
	setLiveMonthlyLeaderboard,
	pool,
	requireDatabase,
};
