# Phase 65 — rating snapshot review scope

## Decision

`KWT_ONLY`, `WEEKLY_ONLY`, and `KWT_PLUS_WEEKLY` are evidence review scopes,
not separate mathematical models. The local package generator already carries
the scope in its manifest and deterministic snapshot ID. Persistence therefore
must carry the same value and include it in snapshot identity.

## Proposed correction

`supabase/proposals/20261019_handicap_rating_snapshot_review_scope.proposed.sql`
adds a constrained `review_scope` field and replaces the Phase 59 four-column
unique key with a five-column key including that field. It does not alter
existing rows, grants, RLS, append-only triggers, legacy Handicap tables, or
rating data.

The column is nullable only to preserve any pre-existing snapshots whose scope
cannot be reconstructed safely. A `NOT VALID` check rejects null or unsupported
values on new writes while leaving such historical rows for separate evidence
review. The Production preflight must confirm the actual table state and stop
if the expected Phase 59 contract has changed.

## Import contract

The local Phase 65 harness applies the correction to a disposable PostgreSQL
17.11 database, then imports the existing Phase 63 calculation run, 14,394
provenance rows, and 169 unpublished rating snapshots. It verifies that the
scope-aware key is unique, Weekly provenance remains course-rating-only, no
index snapshots are created, and failed transactions leave no partial rows.

No Production SQL is executed by this phase.
