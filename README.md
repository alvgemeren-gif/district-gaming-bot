# District Gaming Discord Bot

## Scoreboard commands

Members:

- `/match submit` — choose a kills or win submission in one command. Kills need
  no screenshot; wins require screenshot proof through Discord's
  mobile-compatible attachment field.
  the same image can also prove a Victory Royale.
- `/match status` — view the member's latest or specified submission.
- `/scoreboard` — post all five districts ranked by approved monthly points;
  the same message updates automatically after moderation actions.
- `/points` — post the same automatically updating points overview.
- `/monthly-winners` — view the all-time leaderboard of monthly champions.
- `/player-leaderboard month` — view this month's members ranked by wins and kills.
- `/player-leaderboard history` — add up completed-month wins and kills per member.
- `/player-leaderboard winners` — view each month's win and kill leaders.

Administrators:

- `/score-admin review` — list pending submissions or inspect a submission and stored screenshot.
- `/score-admin approve` — approve kills and optionally award one Victory Royale.
- `/score-admin edit` — correct an approved kill or victory award.
- `/score-admin reject` — reject a submission.
- `/score-admin remove` — remove a submission and its points.
- `/score-admin panel` — post a live scoreboard that refreshes after moderation actions.
- `/score-admin logs` — view the moderation audit trail.
- `/player-leaderboard-admin panel` — post a live member leaderboard.
- `/itemshop [kanaal]` — post up to ten newly released Item Shop offers; it refreshes every 15 minutes.
- `/fortnite-updates kanaal [meldingsrol]` — follow new in-game news and Fortnite build changes every 10 minutes.
- `/level-admin reward-add` — add a role reward to a level.
- `/level-admin reward-remove` — remove one or all rewards from a level.
- `/level-admin channel` — configure the level-up announcement channel.
- `/ticket-admin panel-create` — create and post a ticket panel.
- `/ticket-admin panels` — view all configured ticket panels.
- `/invites-admin beloning-toevoegen` — geef automatisch een rol vanaf een ingesteld aantal actieve invites.
- `/invites-admin beloning-verwijderen` — verwijder een ingestelde invitebeloning.

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
- `/level-admin reward-add` — add a role reward to a level (administrator).
- `/level-admin reward-remove` — remove one or all rewards from a level (administrator).
- `/level-admin channel` — configure the level-up announcement channel (administrator).

The bot role must be above every reward role and needs **Manage Roles**.
Level data and configuration are stored in `data/levels.json`.

## Invite-systeem

De bot vergelijkt Discord-invites wanneer een lid binnenkomt en onthoudt wie
dat lid heeft uitgenodigd. Vertrekt het uitgenodigde lid, dan wordt het actieve
aantal weer verlaagd en worden rolbeloningen opnieuw bijgewerkt.

- `/invites aantal [lid]` — bekijk het aantal actieve uitgenodigde leden.
- `/invites leaderboard` — bekijk de tien beste uitnodigers.
- `/invites beloningen` — bekijk de ingestelde roldrempels.
- `/invites-admin beloning-toevoegen aantal rol` — stel een automatische rol in.
- `/invites-admin beloning-verwijderen aantal [rol]` — verwijder een beloning.

De bot heeft **Server beheren** (om invites uit te lezen) en **Rollen beheren**
nodig. De botrol moet
boven iedere beloningsrol staan. Invitegegevens staan in `data/invites.json`.

## Ticket system

Administrators can create any number of custom ticket panels:

- `/ticket-admin panel-create` — choose a title, description, button text, category,
  support role, panel channel and optional color.
- `/ticket-admin panels` — view all configured panels.
- `/ticket close` — close the current ticket and automatically delete its channel.

Each member can have one open ticket per panel. Ticket channels are private to
the member and selected support role. The button inside a ticket can also be
used to close it. Closing through either route deletes the generated ticket
channel automatically. Ticket configuration is stored in `data/tickets.json`.

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
results scored in the current UTC calendar month. Within one minute after a new
month starts, both live scoreboards switch to the new month with totals of zero.
The previous month's winning district is frozen and receives exactly one point
on the live `/monthly-winners` team leaderboard. That leaderboard updates
automatically too. Tied first-place districts each receive one point, and the
database prevents a month from being awarded twice after a restart.

Member statistics use the same approved submissions. At month end, every
member's wins, kills, points and rankings are frozen in the monthly archive.
Ties for most wins or most kills are stored as shared first places.
The live member panel refreshes after moderation actions and once per minute.

## Victory screenshot verification

Kill-only submissions do not use screenshots. Victory Royale submissions
require a screenshot through Discord's attachment field, which is also
available on mobile. Screenshots are limited to PNG, JPEG, or WebP files up to
8 MB. The bot stores the image in PostgreSQL and stores its SHA-256 hash to
reject duplicate images.

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

## Signal Loom daily game

Signal Loom is a standalone, mobile-friendly five-round visual logic game.
Players open a temporary signed game link, must already have a configured
district, and can start only one run in any rolling 24-hour period.
No separate Discord OAuth authorization screen is needed. Every answer is
checked in a locked PostgreSQL transaction; the browser never receives puzzle
answers.

A completed run awards `3 + correct answers` district points, plus 2 for a
perfect result (3–10 total). These points are included in the live monthly
district scoreboard. The game page also shows daily and all-time player
leaderboards.

Add these Render environment variables:

```env
DAILY_GAME_URL=https://your-service.example
DAILY_GAME_SECRET=a-separate-long-random-secret
```

Optional screenshot detector:

```env
VICTORY_VERIFICATION_URL=https://your-verifier.example.com/verify
VICTORY_VERIFICATION_TOKEN=...
```

Optional Fortnite shop API key (the public feed works without one, but a key
can provide higher limits):

```env
FORTNITE_API_KEY=...
```
