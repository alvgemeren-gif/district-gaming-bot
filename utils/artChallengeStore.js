const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const pool = connectionString
	? new Pool({
		connectionString,
		ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
	})
	: null;

let schemaPromise;

function requireDatabase() {
	if (!pool) throw new Error('DATABASE_URL is not configured.');
	if (!schemaPromise) {
		schemaPromise = pool.query(`
			CREATE TABLE IF NOT EXISTS art_challenge_config (
				guild_id TEXT PRIMARY KEY,
				channel_id TEXT NOT NULL,
				next_post_at TIMESTAMPTZ NOT NULL,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS art_challenges (
				id BIGSERIAL PRIMARY KEY,
				guild_id TEXT NOT NULL,
				prompt TEXT NOT NULL,
				message_id TEXT,
				starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				ends_at TIMESTAMPTZ NOT NULL
			);

			CREATE INDEX IF NOT EXISTS art_challenges_current_idx
				ON art_challenges (guild_id, ends_at DESC);

			CREATE TABLE IF NOT EXISTS art_submissions (
				id BIGSERIAL PRIMARY KEY,
				challenge_id BIGINT NOT NULL REFERENCES art_challenges(id) ON DELETE CASCADE,
				guild_id TEXT NOT NULL,
				user_id TEXT NOT NULL,
				image_url TEXT NOT NULL,
				caption TEXT,
				message_id TEXT,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				UNIQUE (challenge_id, user_id)
			);

			CREATE TABLE IF NOT EXISTS art_votes (
				submission_id BIGINT NOT NULL REFERENCES art_submissions(id) ON DELETE CASCADE,
				user_id TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				PRIMARY KEY (submission_id, user_id)
			);
		`);
	}
	return schemaPromise;
}

async function configureGuild(guildId, channelId) {
	await requireDatabase();
	const result = await pool.query(
		`INSERT INTO art_challenge_config (guild_id, channel_id, next_post_at)
		 VALUES ($1, $2, NOW())
		 ON CONFLICT (guild_id) DO UPDATE
		 SET channel_id = EXCLUDED.channel_id, next_post_at = NOW(), updated_at = NOW()
		 RETURNING *`,
		[guildId, channelId],
	);
	return result.rows[0];
}

async function getConfig(guildId) {
	await requireDatabase();
	const result = await pool.query('SELECT * FROM art_challenge_config WHERE guild_id = $1', [guildId]);
	return result.rows[0] || null;
}

async function getDueConfigs() {
	await requireDatabase();
	const result = await pool.query('SELECT * FROM art_challenge_config WHERE next_post_at <= NOW()');
	return result.rows;
}

async function scheduleNext(guildId) {
	await requireDatabase();
	await pool.query(
		`UPDATE art_challenge_config
		 SET next_post_at = GREATEST(next_post_at + INTERVAL '7 days', NOW() + INTERVAL '7 days'), updated_at = NOW()
		 WHERE guild_id = $1`,
		[guildId],
	);
}

async function createChallenge(guildId, prompt) {
	await requireDatabase();
	const result = await pool.query(
		`INSERT INTO art_challenges (guild_id, prompt, ends_at)
		 VALUES ($1, $2, NOW() + INTERVAL '7 days') RETURNING *`,
		[guildId, prompt],
	);
	return result.rows[0];
}

async function setChallengeMessage(challengeId, messageId) {
	await requireDatabase();
	await pool.query('UPDATE art_challenges SET message_id = $2 WHERE id = $1', [challengeId, messageId]);
}

async function getCurrentChallenge(guildId) {
	await requireDatabase();
	const result = await pool.query(
		`SELECT * FROM art_challenges
		 WHERE guild_id = $1 AND ends_at > NOW()
		 ORDER BY starts_at DESC LIMIT 1`,
		[guildId],
	);
	return result.rows[0] || null;
}

async function createSubmission(challengeId, guildId, userId, imageUrl, caption) {
	await requireDatabase();
	const result = await pool.query(
		`INSERT INTO art_submissions (challenge_id, guild_id, user_id, image_url, caption)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (challenge_id, user_id) DO NOTHING RETURNING *`,
		[challengeId, guildId, userId, imageUrl, caption || null],
	);
	return result.rows[0] || null;
}

async function setSubmissionMessage(submissionId, messageId) {
	await requireDatabase();
	await pool.query('UPDATE art_submissions SET message_id = $2 WHERE id = $1', [submissionId, messageId]);
}

async function deleteSubmission(submissionId) {
	await requireDatabase();
	await pool.query('DELETE FROM art_submissions WHERE id = $1', [submissionId]);
}

async function toggleVote(submissionId, userId) {
	await requireDatabase();
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const submissionResult = await client.query(
			`SELECT s.*, c.ends_at FROM art_submissions s
			 JOIN art_challenges c ON c.id = s.challenge_id
			 WHERE s.id = $1 FOR UPDATE`,
			[submissionId],
		);
		const submission = submissionResult.rows[0];
		if (!submission) throw new Error('SUBMISSION_NOT_FOUND');
		if (new Date(submission.ends_at) <= new Date()) throw new Error('VOTING_CLOSED');
		if (submission.user_id === userId) throw new Error('SELF_VOTE');

		const removed = await client.query(
			'DELETE FROM art_votes WHERE submission_id = $1 AND user_id = $2 RETURNING user_id',
			[submissionId, userId],
		);
		let voted = false;
		if (!removed.rowCount) {
			await client.query('INSERT INTO art_votes (submission_id, user_id) VALUES ($1, $2)', [submissionId, userId]);
			voted = true;
		}
		const countResult = await client.query(
			'SELECT COUNT(*)::INTEGER AS count FROM art_votes WHERE submission_id = $1',
			[submissionId],
		);
		await client.query('COMMIT');
		return { voted, count: countResult.rows[0].count };
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

module.exports = {
	configureGuild,
	createChallenge,
	createSubmission,
	deleteSubmission,
	getConfig,
	getCurrentChallenge,
	getDueConfigs,
	scheduleNext,
	setChallengeMessage,
	setSubmissionMessage,
	toggleVote,
};
