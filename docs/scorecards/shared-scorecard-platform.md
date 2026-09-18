# Shared scorecard platform

Status: local foundation only. The migration has not been executed and no production configuration has been changed.

## Audit result

- All-Time already provides the best evidence-viewer UX: drag/drop, zoom, pan, rotate, full-screen inspection, authoritative pars, hole-by-hole entry, and running totals. The shared reviewer reuses those interaction patterns without changing existing All-Time entry.
- Majors already owns a working 18-hole lifecycle with draft/submitted/verified/reopened states and Thursday–Sunday round identity. Majors should retain that workflow and gain compatibility links later rather than being rewritten.
- Stroke uses managed approved rosters, exact schedule fixtures, `save_stroke_result`, and `rebuild_stroke_standings`. It is the first commit-ready adapter.
- Match stores final holes-won results. The shared core can preserve both complete cards, but the exact per-hole derivation into existing HW must be approved and implemented in a Match adapter. Public Match score privacy remains unchanged.
- PYP requires explicit Home/Away and two-course component mapping. Its current result writer cannot be safely fed by a generic single-card adapter.
- KWT retains Easy/Hard semantics. Its authoritative live card source and exact course codes need to be identified before a commit adapter is enabled. Handicap behavior is out of scope.
- Doubles requires canonical team ownership. The current app uses `doubles_teams`; its live result writer and individual-versus-team card ownership need a separate authority audit.
- Amateur to Pro remains blocked by the unresolved current-season/current-roster model.
- Existing All-Time records are not retroactively migrated. New opt-in compatibility can be added later.

## Architecture

The shared core stores immutable competition context snapshots, canonical participants, private evidence, structured scorecards, exactly 18 holes, revisions, and adapter-commit state. League adapters validate their own card structures and produce calls to existing authoritative result writers.

Verification is a small saga:

1. Save every reviewed 18-hole card and an audit revision.
2. Move the cards to `verified_pending_commit` and create an idempotent adapter commit.
3. Call the league's existing authoritative result writer and standings refresh.
4. Mark the shared cards verified only after the adapter succeeds.
5. If the adapter fails, retain the authoritative league save if it occurred, return cards to review, record the failure, and allow a safe idempotent retry. No evidence image is deleted.

## Tables

- `shared_scorecard_contexts`: league/event, authoritative source, season/event, division, game/round, frozen course identity, difficulty, and the 18-hole par snapshot actually used.
- `shared_scorecard_participants`: canonical `public.players.id` or canonical team ownership with role and display-name provenance.
- `shared_scorecard_evidence`: private object path, submitter provenance, hash, timestamps, review state, and nullable future retention policy. No deletion policy is selected.
- `shared_scorecards`: one component/card per participant or team, canonical Played Date, raw Card Date Text, totals, review state, and adapter result.
- `shared_scorecard_holes`: exactly 18 raw stroke values plus frozen pars and derived score-to-par.
- `shared_scorecard_revisions`: before/after snapshots, admin identity, timestamp, and correction reason.
- `shared_scorecard_adapter_commits`: idempotent adapter handoff and failure state.

All shared tables have forced RLS, no `anon` or `authenticated` table grants, and service-role-only writes. The private evidence bucket has no public policies. The only player-facing RPC is no-argument, authenticated-only, and self-resolves through `auth.uid()` and `current_user_canonical_player_id()`.

## Dates

`arranged_played_date` wins over `event_played_date`, which wins over an admin calendar selection. `card_date_text` is provenance only and is never parsed. Ambiguous text such as `09/10/26` cannot silently become the canonical Played Date.

## Discord intake

The Railway bot uses a native required File Upload modal. It sends the image to a signed server-to-server endpoint with `SCORECARD_BRIDGE_SECRET`; it never sends the Discord bot token. The website re-resolves the Discord user to exactly one canonical player, reloads the authoritative fixture, verifies participation, reserves one evidence row, and uploads with `upsert: false` into private storage. A duplicate or completed submission fails closed.

Required future configuration (not configured here):

- Website and bot: the same high-entropy `SCORECARD_BRIDGE_SECRET`.
- Bot: `KRYS_LEAGUES_API_BASE_URL`.
- Website: existing Supabase service credential for private storage and server-only adapter work.

## Player history

`get_my_verified_scorecard_history_v1()` returns only the authenticated canonical player's verified cards, holes, course snapshot, dates, totals, and league result. It accepts no player UUID. No internal UUID, auth ID, Discord ID, evidence path, or admin metadata is returned.

## Migration phases

1. Shared additive schema, private bucket, admin reviewer, self-only history boundary.
2. Stroke adapter and Discord exact-fixture intake.
3. Match adapter after the 18-hole-to-HW mapping is approved.
4. PYP adapter after Home/Away two-course component mapping is approved.
5. Majors compatibility alignment without replacing its working lifecycle.
6. KWT and Doubles after their live card/team writer authority is confirmed.
7. Amateur to Pro only after its current roster and season authority is resolved.

No existing historical tables are rewritten in this plan.
