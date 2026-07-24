# District Gaming Discord Bot

## Scoreboard commands

Members:

- `/match submit` — submit a kill count with a required evidence screenshot;
  the same image can also prove a Victory Royale.
- `/match status` — view the member's latest or specified submission.
- `/scoreboard` — post all five districts ranked by approved monthly points;
  the same message updates automatically after moderation actions.
- `/points` — post the same automatically updating points overview.
- `/monthly-winners` — view the all-time leaderboard of monthly champions.
- `/player-leaderboard month` — view this month's members ranked by wins and kills.
- `/player-leaderboard history` — add up completed-month wins and kills per member.
- `/player-leaderboard winners` — view each month's win and kill leaders.
- `/player-leaderboard panel` — post a live member leaderboard (administrator).

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

## Level system

Members earn 15 XP for an eligible message, with a one-minute cooldown per
member. Level requirements use `level² × 100` XP.

- `/level rank [member]` — view level, XP and progress to the next level.
- `/level leaderboard` — view the ten members with the most XP.
- `/level rewards` — view all configured role rewards.
- `/level reward-add` — add a role reward to a level (administrator).
- `/level reward-remove` — remove one or all rewards from a level (administrator).
- `/level channel` — configure the level-up announcement channel (administrator).

The bot role must be above every reward role and needs **Manage Roles**.
Level data and configuration are stored in `data/levels.json`.

## Ticket system

Administrators can create any number of custom ticket panels:

- `/ticket panel-create` — choose a title, description, button text, category,
  support role, panel channel and optional color.
- `/ticket panels` — view all configured panels.
- `/ticket close` — close and archive the current ticket.

Each member can have one open ticket per panel. Ticket channels are private to
the member and selected support role. The button inside a ticket can also be
used to close it. Ticket configuration is stored in `data/tickets.json`.

The score is calculated from approved submissions only:

```text
score = (Victory Royales × 10) + kills
```

## Moderation dashboard

Open `/admin` on the bot's public web address to review match submissions.
The dashboard shows submitted kills, their required screenshot evidence,
Victory Royale evidence and detection
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

Member statistics use the same approved submissions. At month end, every
member's wins, kills, points and rankings are frozen in the monthly archive.
Ties for most wins or most kills are stored as shared first places.
The live member panel refreshes after moderation actions and once per minute.

## Victory screenshot verification

Every match submission requires a screenshot on which the submitted kill count
is visible. The same screenshot can also show a Victory Royale. Screenshots are
limited to PNG, JPEG, or WebP files up to 8 MB. The bot stores the image in
PostgreSQL and stores its SHA-256 hash to reject duplicate images.

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
