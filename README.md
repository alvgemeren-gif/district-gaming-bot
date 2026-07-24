# District Gaming Discord Bot

## Scoreboard commands

Members:

- `/match submit` — submit a kill count and optional Victory Royale screenshot.
- `/match status` — view the member's latest or specified submission.
- `/scoreboard` — show all five districts ranked by approved monthly points.
- `/monthly-winners` — view the all-time leaderboard of monthly champions.

Administrators:

- `/score-admin review` — list pending submissions or inspect a submission and stored screenshot.
- `/score-admin approve` — approve kills and optionally award one Victory Royale.
- `/score-admin edit` — correct an approved kill or victory award.
- `/score-admin reject` — reject a submission.
- `/score-admin remove` — remove a submission and its points.
- `/score-admin panel` — post a live scoreboard that refreshes after moderation actions.
- `/score-admin logs` — view the moderation audit trail.

Welcome system:

- `/welcome editor` — choose a channel and open a multiline message editor.
- `/welcome test` — send a test with the saved template.
- `/welcome status` — view the active channel and template.
- `/welcome enable` — reactivate the previously saved welcome message.
- `/welcome disable` — stop automatic welcome messages.

Welcome templates support `{user}`, `{username}`, `{server}`, and
`{membercount}`. The configuration is stored in PostgreSQL.

The score is calculated from approved submissions only:

```text
score = (Victory Royales × 10) + kills
```

## Moderation dashboard

Open `/admin` on the bot's public web address to review match submissions.
The dashboard shows submitted kills, Victory Royale evidence and detection
results. Pending submissions can be approved (with corrected kills and an
optional Victory Royale bonus) or rejected. Recent processed submissions are
available through the status filter.

Set these environment variables before opening the dashboard:

- `ADMIN_DASHBOARD_TOKEN` — a long, random password used to log in.
- `ADMIN_ACTOR_ID` — the Discord user ID recorded in the moderation log.
- `DASHBOARD_URL` — the public Render service URL, without `/admin`.

Administrators can use `/score-admin dashboard` in Discord to receive an
ephemeral **Open moderation app** button. Render's automatic
`RENDER_EXTERNAL_URL` is used when `DASHBOARD_URL` is not set.

The login cookie is HTTP-only, same-site restricted and marked secure in
production. Both kill-only and Victory Royale submissions remain pending until
they are approved in this dashboard.

## Monthly competition

The active `/points`, `/scoreboard`, and live scoreboard totals include only
results scored in the current UTC calendar month. At the start of a new month,
the active totals return to zero automatically. The previous month's winning
district (including exact points, wins, and kills) is frozen in the
`/monthly-winners` champions leaderboard. It ranks districts by monthly titles
and then by the total score earned during winning months. Tied districts are
stored as joint winners.

## Victory screenshot verification

Screenshots are limited to PNG, JPEG, or WebP files up to 8 MB. The bot stores the
image in PostgreSQL and stores its SHA-256 hash to reject duplicate images.

Set `VICTORY_VERIFICATION_URL` to integrate an existing screenshot detector. The
bot sends:

```json
{
  "screenshotUrl": "https://...",
  "sha256": "...",
  "expectedBanner": "#1 Victory Royale"
}
```

The verifier should return:

```json
{
  "isVictory": true,
  "confidence": 0.99,
  "reason": "Official banner detected"
}
```

Responses below 99% confidence, missing verifier configuration, and verifier
errors are routed to manual review. No submission awards points until a server
administrator approves it.

## Required environment variables

```env
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...
DATABASE_URL=postgresql://...
```

Optional screenshot detector:

```env
VICTORY_VERIFICATION_URL=https://your-verifier.example.com/verify
VICTORY_VERIFICATION_TOKEN=...
```
