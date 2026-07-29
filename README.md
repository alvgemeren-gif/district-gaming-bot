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
- `/itemshop [channel]` — post up to ten newly released Item Shop offers; it refreshes every 15 minutes.
- `/fortnite-updates channel [notification-role]` — follow new in-game news and Fortnite build changes every 10 minutes.
- `/level-admin reward-add` — add a role reward to a level.
- `/level-admin reward-remove` — remove one or all rewards from a level.
- `/level-admin channel` — configure the level-up announcement channel.
- `/ticket-admin panel-create` — create and post a ticket panel.
- `/ticket-admin standard-panels` — post the Partner, Applications, Help and Questions panels at once.
- `/ticket-admin panels` — view all configured ticket panels.
- `/invites-admin reward-add` — automatically award a role at a configured number of active invites.
- `/invites-admin reward-remove` — remove a configured invite reward.

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

## Invite system

The bot compares Discord invites when a member joins and records who invited
that member. When an invited member leaves, the active count is reduced and
role rewards are updated automatically.

- `/invites count [member]` — view the number of active invited members.
- `/invites leaderboard` — view the top ten inviters.
- `/invites rewards` — view the configured role thresholds.
- `/invites-admin reward-add count role` — configure an automatic role reward.
- `/invites-admin reward-remove count [role]` — remove an invite reward.

The bot needs **Manage Server** to read invites and **Manage Roles** to update
rewards. Its highest role must be above every reward role. Invite data is
stored in `data/invites.json`.

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
score = kills + (Victory Royales × 10) + (Crown Victories × 5)
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

### Built-in AI verifier (OpenRouter)

The bot ships with a free AI verifier. It sends the screenshot to a free vision
model on OpenRouter and reads back whether the image is a Victory Royale, how
many eliminations it shows, and whether it is a Crown Victory. Enable it with a
single variable:

```env
OPENROUTER_API_KEY=sk-or-v1-...
```

Create a free key at https://openrouter.ai/keys (no credit card, works in the
EU).

Leave `VICTORY_VERIFICATION_URL` unset. The bot then verifies in-process using
the screenshot it already downloaded, which avoids a second download of the same
image. The same verifier is also exposed over HTTP at `/verify` for external
callers; `VICTORY_VERIFICATION_TOKEN` protects that endpoint as a `Bearer`
token.

The verifier automatically tries several free vision models in turn, so a single
overloaded free provider (HTTP 429/502) does not block a submission. Set
`OPENROUTER_MODEL` to pin one specific model instead of using the built-in list.

Every `/match submit` automatically calls the verifier — no command needs to be
typed. The bot stores the AI prediction alongside each submission.

**Provider fallback.** Configure any combination of `OPENROUTER_API_KEY`,
`GROQ_API_KEY` and `GEMINI_API_KEY`. The verifier tries them in that order and
moves to the next one whenever a provider errors out, so a dead provider does not
block a submission. Only when every configured provider fails does the
submission go to manual review. Note that Google's free Gemini tier is not
available in every region.

### Custom verifier contract

To use your own detector instead, point `VICTORY_VERIFICATION_URL` at it. That
takes priority over the built-in verifier. The bot sends:

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
  "kills": 7,
  "crownVictory": false,
  "confidence": 0.99,
  "reason": "Official banner detected"
}
```

Responses below 99% confidence, missing verifier configuration, and verifier
errors are routed to manual review.

### Shadow mode and automatic approval

The verifier starts in **shadow mode**: it records a prediction for every
submission, but nothing is awarded automatically — every submission stays pending
until a server administrator approves it, exactly as before. Each human decision
is compared against the AI prediction to measure accuracy.

Once enough submissions have been reviewed by humans and the measured accuracy is
high enough, the bot begins **auto-approving** new high-confidence Victory
submissions. Auto-approvals are recorded in the moderation log under the actor
`ai-auto` and can be corrected with `/score-admin edit` or `/score-admin remove`;
those corrections feed back into the accuracy measurement. The thresholds:

```env
AI_AUTO_APPROVE_MIN_SAMPLE=50     # human-reviewed high-confidence samples required first
AI_AUTO_APPROVE_MIN_ACCURACY=0.99 # measured accuracy required to auto-approve
```

Until both thresholds are met, no submission is ever auto-approved.

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

## District Dominion city game

`/city` opens a separate browser-based idle city game. Discord OAuth identifies
the player and the bot verifies the member's permanent district role on every
session. Resources, offline production (maximum 12 hours), upgrade timers,
research, daily rewards, achievements and district totals are calculated and
validated in locked PostgreSQL transactions.

In the Discord Developer Portal, add this exact OAuth redirect:

```text
https://your-service.example/city/auth/callback
```

Configure:

```env
CITY_GAME_URL=https://your-service.example
CITY_GAME_SECRET=a-long-independent-random-secret
DISCORD_CLIENT_SECRET=the-oauth-client-secret
```

Run `/city` in Discord to receive the launch button. Building and research
definitions live in `utils/cityGameContent.js`, so future buildings and
technologies can be added without changing the game engine.

AI screenshot verifier (free OpenRouter; see "Victory screenshot
verification" above for details):

```env
OPENROUTER_API_KEY=sk-or-v1-...
VICTORY_VERIFICATION_URL=https://your-service.example/verify
VICTORY_VERIFICATION_TOKEN=...
```

Optional Fortnite shop API key (the public feed works without one, but a key
can provide higher limits):

```env
FORTNITE_API_KEY=...
```

## DISBOARD bump reminder

The bot can remind members every two hours to run DISBOARD's `/bump` command.
The first reminder is sent two hours after the bot starts. Add the target
channel ID and, optionally, a role to mention:

```env
BUMP_CHANNEL_ID=...
BUMP_ROLE_ID=...
```

Leave `BUMP_ROLE_ID` unset to send the reminder without mentioning a role.
