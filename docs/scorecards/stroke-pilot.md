# Stroke shared-scorecard pilot

This pilot is additive and local-only. It does not activate the Railway bot or install either migration.

## Authoritative flow

1. `loadAuthoritativeStrokeBoards` selects the newest approved managed Stroke roster, its occupied roster-slot divisions, roster-scoped schedule, authoritative results, and Stroke standings.
2. A Discord submission is authorized against the exact fixture and canonical `public.players.id` resolved from the Discord identity.
3. Evidence is copied to the private `shared-scorecard-evidence` bucket before the evidence row becomes `submitted`.
4. The consolidated `/admin/stroke/manage` workspace opens the existing shared reviewer for `SCORECARD RECEIVED`; `NOT PLAYED` retains the existing manual-scoring fallback.
5. The reviewer stores two complete 18-hole cards with frozen pars, Played Date authority, raw card-date provenance, revisions, and the evidence link.
6. Verification calls the existing `save_stroke_result` writer and `rebuild_stroke_standings`. Negative score-to-par totals remain valid.
7. Result/evidence/schedule/roster changes queue a board outbox revision. The bot polls over the HMAC bridge and edits the recorded message. A mapped message that cannot be edited is never replaced automatically.

## Persistent board and retry model

`stroke_discord_boards` stores one `(season_id, division_number)` mapping to the server-selected Discord channel and persistent message. `stroke_discord_board_sync_outbox` stores the desired retryable sync state. Both are private, forced-RLS, service-role-only tables in the separate pilot migration.

Discord failure never rolls back a saved result, verified card, or rebuilt standings. The outbox remains failed/pending and the Admin workspace can queue a retry. Adapter commit idempotency prevents duplicate result commits.

## Date model

Played Date is selected in this order: arranged fixture date, authoritative event date, then Admin calendar selection. `CARD DATE TEXT` remains exact optional provenance and is never parsed. For example, `09/10/26` cannot silently become a Played Date.

## Local/test registration

`scorecard_local_registration.py` is the only registration entry point added to the bot. The live `bot.py` does not import it. A controlled Railway release must explicitly add Production registration after schema and configuration approval.

## Later Production configuration

Website and Railway:

- `SCORECARD_BRIDGE_SECRET` — one dedicated strong shared secret, never the Discord token.

Railway:

- `KRYS_LEAGUES_API_BASE_URL`
- Existing `DISCORD_TOKEN` remains unchanged.
- `DISCORD_STROKE_D1_CHANNEL_ID`
- `DISCORD_STROKE_D2_CHANNEL_ID`
- `DISCORD_STROKE_D3_CHANNEL_ID`
- `DISCORD_STROKE_D4_CHANNEL_ID`
- `DISCORD_STROKE_D5_CHANNEL_ID` (configured but receives no task until D5 is occupied in the approved current roster)

The website never receives the bot token. The browser never supplies a Discord channel, API URL, service secret, or canonical player ID.

## End of season

Finalization remains deliberately inactive. The safe design is: generate one final static division snapshot from verified structured history, retain website history/evidence under the chosen retention policy, mark the old board historical, and only then reuse the division channel for the next approved managed roster. No Season 63 state is reset by this pilot.
