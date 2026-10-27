# Phase 127 rolling-20 persistence and player-read preparation

Status: **LOCAL PREPARATION ONLY / UNPUBLISHED**.

This package adds the minimum persistence/read-model support for the approved Phase 126 rolling-20 policy. It does not import, publish, update, or delete Production Handicap data.

## Approved local policy represented

- Active window: the 20 most recent qualifying KWT scorecards.
- Index calculation: arithmetic mean of all active differentials; no best-five selection.
- One to 19 qualifying cards: `PROVISIONAL`.
- Twenty cards: `OFFICIAL_ELIGIBLE`, subject to rating approval, publication approval, chronology, provenance, and security gates.
- Zero cards: `NOT_YET_RATED`.
- An explicitly approved and published 1–19-card result remains visible as `PROVISIONAL`; statistical status alone never publishes it.
- Weekly evidence remains course-rating-only and cannot enter the personal-index path.
- Existing legacy snapshots remain `LEGACY_BEST_FIVE` and are not exposed by the new publication view.

## Proposed files

1. `supabase/proposals/20261022_handicap_rolling20_persistence.proposed.sql`
   - Additive columns and constraints on `public.handicap_index_snapshots`.
   - Replaces the publishable-index view definition with a rolling-20, explicit-effective-date, approved-status gate.
   - Preserves security-invoker behavior, client access denial, provenance validation, chronology opt-in, and append-only history.
2. `supabase/proposals/20261022_handicap_rolling20_player_read_rpc.proposed.sql`
   - Separate, guarded proposal for `get_published_handicap_for_player(uuid)`.
   - Binds the supplied UUID to the authenticated canonical player identity and returns no source evidence arrays.
   - Must not be installed in the same transaction as a publication or data import.
3. `scripts/phase127_rolling20_persistence_local.mjs`
   - Disposable PostgreSQL 17.11 harness. It applies the Phase 59-like schema, the Phase 127 proposal, synthetic official/provisional rows, the RPC proposal, and failure/idempotency checks.
4. `scripts/phase127_persistence_contract.test.mjs`
   - Static contract checks for additive fields, publication filtering, and identity-bound reads.

## Installation order for a future separately authorized release

1. Verify the exact project, schema, row counts, grants, RLS, security-invoker views, append-only trigger, and absence of the four rolling-20 columns.
2. Verify this package and the Phase 126 candidate checksums.
3. Install the persistence proposal transactionally; do not import or publish rows.
4. Run read-only postflight and confirm legacy snapshots, views, grants, and counts are unchanged except for the approved schema/view definition.
5. Review and separately authorize the guarded player-read RPC; install it only after its preflight passes.
6. Prepare a new append-only candidate run using `active_twenty_source_round_ids`, `active_round_count`, `handicap_status`, and approved effective dates. Keep it unpublished until rating and publication approvals are explicit.
7. Release the player profile/read route only after the RPC and publication view have been verified with anonymous, cross-player, and authorized-player tests.

Any schema drift, existing rolling-20 columns, unexpected client privilege, missing append-only guard, or conflicting function must stop the process before SQL execution.

## Local proof

- Disposable PostgreSQL 17.11 harness: **PASS**.
- Contract tests: **2/2 PASS**.
- Existing Phase 126 artifact tests: **3/3 PASS**.
- Existing Handicap suite: **208/208 PASS**.
- TypeScript: **PASS**.
- Targeted ESLint: **PASS**.
- `git diff --check`: **PASS**.

Production was read-only inspected and was not modified by this phase.
