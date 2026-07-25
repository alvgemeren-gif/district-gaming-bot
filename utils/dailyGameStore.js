const crypto = require('crypto');
const { pool, requireDatabase } = require('./scoreStore');

const ROUND_COUNT = 5;
let schemaPromise;

function challengeKey(date = new Date()) {
	return date.toISOString().slice(0, 10);
}

function gameSecret() {
	return process.env.DAILY_GAME_SECRET || process.env.DISCORD_OAUTH_SECRET || process.env.ADMIN_DASHBOARD_TOKEN || 'cozy-hotel-development';
}

function randomBytes(key, round) {
	return crypto.createHmac('sha256', gameSecret()).update(`${key}:${round}:signal-loom-v1`).digest();
}

function puzzleFor(key, round) {
	const bytes = randomBytes(key, round);
	const size = round < 2 ? 3 : 4;
	const operation = round % 2 === 0 ? 'add' : 'xor';
	const row = Array.from({ length: 3 }, (_, index) => bytes[index] % size);
	const column = Array.from({ length: 3 }, (_, index) => bytes[index + 4] % size);
	const valueAt = (r, c) => operation === 'xor'
		? (row[r] ^ column[c]) % size
		: (row[r] + column[c]) % size;
	const cells = [];

	for (let r = 0; r < 3; r += 1) {
		for (let c = 0; c < 3; c += 1) {
			cells.push(r === 2 && c === 2 ? null : valueAt(r, c));
		}
	}

	return {
		round,
		size,
		cells,
		options: Array.from({ length: size }, (_, value) => value),
		answer: valueAt(2, 2),
	};
}

async function ensureSchema() {
	await requireDatabase();
	if (!schemaPromise) {
		schemaPromise = pool.query(`
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
		`);
	}
	return schemaPromise;
}

function publicAttempt(row) {
	const answers = Array.isArray(row.answers) ? row.answers : [];
	return {
		challengeKey: String(row.challenge_key).slice(0, 10),
		round: answers.length,
		roundCount: ROUND_COUNT,
		correctCount: row.correct_count,
		completed: Boolean(row.completed_at),
		performanceScore: row.performance_score,
		districtPoints: row.district_points,
		startedAt: row.started_at,
		completedAt: row.completed_at,
	};
}

async function getOrStartAttempt({ guildId, userId, username, districtRoleId }) {
	await ensureSchema();
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const active = await client.query(
			`SELECT * FROM daily_game_attempts
			 WHERE guild_id = $1 AND user_id = $2
			   AND started_at > NOW() - INTERVAL '24 hours'
			 ORDER BY started_at DESC LIMIT 1 FOR UPDATE`,
			[guildId, userId]
		);
		let row = active.rows[0];
		if (!row) {
			const inserted = await client.query(
				`INSERT INTO daily_game_attempts
				 (guild_id, user_id, username, district_role_id, challenge_key)
				 VALUES ($1, $2, $3, $4, $5) RETURNING *`,
				[guildId, userId, username.slice(0, 80), districtRoleId, challengeKey()]
			);
			row = inserted.rows[0];
		}
		await client.query('COMMIT');
		return row;
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

async function submitAnswer({ guildId, userId, answer }) {
	await ensureSchema();
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const result = await client.query(
			`SELECT * FROM daily_game_attempts
			 WHERE guild_id = $1 AND user_id = $2
			   AND started_at > NOW() - INTERVAL '24 hours'
			 ORDER BY started_at DESC LIMIT 1 FOR UPDATE`,
			[guildId, userId]
		);
		const row = result.rows[0];
		if (!row) throw Object.assign(new Error('Start the challenge first.'), { status: 409 });
		if (row.completed_at) throw Object.assign(new Error('Today’s challenge is already complete.'), { status: 409 });
		const answers = Array.isArray(row.answers) ? row.answers : [];
		const round = answers.length;
		const puzzle = puzzleFor(String(row.challenge_key).slice(0, 10), round);
		if (!Number.isInteger(answer) || answer < 0 || answer >= puzzle.size) {
			throw Object.assign(new Error('Invalid answer.'), { status: 400 });
		}
		const correct = answer === puzzle.answer;
		answers.push({ answer, correct });
		const correctCount = Number(row.correct_count) + (correct ? 1 : 0);
		const completed = answers.length === ROUND_COUNT;
		const elapsedSeconds = Math.max(1, Math.floor((Date.now() - new Date(row.started_at).getTime()) / 1000));
		const performanceScore = completed
			? Math.max(0, 700 - Math.min(elapsedSeconds, 600)) + (correctCount * 100)
			: null;
		const districtPoints = completed ? 3 + correctCount + (correctCount === ROUND_COUNT ? 2 : 0) : null;
		const updated = await client.query(
			`UPDATE daily_game_attempts
			 SET answers = $3, correct_count = $4, performance_score = $5,
			     district_points = $6, completed_at = CASE WHEN $7 THEN NOW() ELSE NULL END
			 WHERE guild_id = $1 AND id = $2 RETURNING *`,
			[guildId, row.id, JSON.stringify(answers), correctCount, performanceScore, districtPoints, completed]
		);
		await client.query('COMMIT');
		return { row: updated.rows[0], correct };
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

async function leaderboards(guildId, key = challengeKey()) {
	await ensureSchema();
	const [daily, allTime] = await Promise.all([
		pool.query(
			`SELECT user_id, username, performance_score, correct_count, district_points, completed_at
			 FROM daily_game_attempts WHERE guild_id = $1 AND challenge_key = $2 AND completed_at IS NOT NULL
			 ORDER BY performance_score DESC, completed_at ASC LIMIT 10`,
			[guildId, key]
		),
		pool.query(
			`SELECT user_id, MAX(username) AS username, SUM(performance_score)::INTEGER AS performance_score,
			        SUM(correct_count)::INTEGER AS correct_count, SUM(district_points)::INTEGER AS district_points,
			        COUNT(*)::INTEGER AS plays
			 FROM daily_game_attempts WHERE guild_id = $1 AND completed_at IS NOT NULL
			 GROUP BY user_id ORDER BY performance_score DESC, plays DESC LIMIT 10`,
			[guildId]
		),
	]);
	return { daily: daily.rows, allTime: allTime.rows };
}

module.exports = {
	ROUND_COUNT,
	challengeKey,
	getOrStartAttempt,
	leaderboards,
	publicAttempt,
	puzzleFor,
	submitAnswer,
};
