# Phase 102 — KWT effective-period gate readiness

Status: **PASS — ready for a separately authorized installation review; not installed.**

This phase performed read-only Production inspection and local validation only. No
Production SQL, migration, rating publication, index publication, or website
deployment was performed.

## Verified baseline

- Supabase project: `jfbndcwdsvsjgnzwvexp` (`Krys-Leagues`, `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.105).
- Live website alias at verification: `krysleagues.com` → `dpl_2B2E1NvtqWZNsMsLWXf2nSrSVpqk`.
- Source checkpoint: `d67c421f8c26f5822d8da132f49673785f3081d7`.
- Phase 96 migration is present in Production as `20261020204109_handicap_official_kwt_sequence_publication_gate_phase96`.
- The Phase 101 effective-period proposal is not recorded as an applied migration.
- Proposal SHA-256: `CDB2E480D67A598B604B592DB51B0A9A79C0CFA042299367DF0F4D92E84333AD`.

## Current Production state

| Object | Result |
|---|---:|
| Calculation runs | 2 |
| Runs in `DRAFT` / `QUARANTINED` | 2 |
| Source provenance rows | 27,944 |
| Rating snapshots | 338 |
| Rating snapshots `UNPUBLISHED` | 338 |
| Rating snapshots `PUBLISHED` | 0 |
| Rating snapshots with `effective_from IS NULL` | 338 |
| Index snapshots | 0 |
| Publishable rating rows | 0 |
| Publishable index rows | 0 |
| Review evidence rows | 1 |
| Review decision rows | 1 |

The two existing runs are the invalid Phase 67 run and corrected Phase 68 run;
both remain `DRAFT`, `QUARANTINED`, and have no official-sequence opt-in. The
existing 338 snapshots therefore cannot become visible through either current or
proposed publication view.

The installed rating view currently requires `effective_from IS NOT NULL`. All
338 existing snapshots have a non-null generic `effective_period`, but zero match
the Phase 101 per-snapshot Season/Week format. This is safe: those rows remain
unpublished and their runs remain quarantined. They must not be updated to fit the
new format.

## Schema and security compatibility

- All six Phase 59 persistence tables exist.
- RLS is enabled on all six; `FORCE ROW LEVEL SECURITY` is false, matching the
  reviewed design.
- `effective_from` is nullable `date`; `effective_period` is nullable `text`.
- The installed review-scope and publication-status constraints remain present.
- `handicap_source_provenance.source_fingerprint` remains unique and the
  canonical-player foreign key remains present.
- Both publication views are `security_invoker=true`.
- Direct client `SELECT` is denied for `public`, `anon`, and `authenticated` on
  the persistence tables and publication views; `service_role` retains the
  reviewed server-side read path.
- Append-only triggers remain enabled for rating snapshots, index snapshots, and
  source provenance. Calculation runs retain their intended lifecycle mutability.
- The review evidence and review decision tables currently have no matching
  append-only trigger in the live catalog; they have no client grants and only
  service-role insert/select privileges. This is an existing Phase 59 contract
  detail, not a change made by this phase and not required by the view-only gate.

## Gate verification

The exact proposal preserves the existing calendar path:

```sql
s.effective_from is not null
```

It adds a separate period-only path that requires all of the following:

1. run status `COMPLETED`;
2. run publication eligibility `ELIGIBLE`;
3. snapshot status `PUBLISHED`;
4. exact `OFFICIAL_KWT_SEQUENCE` run chronology;
5. explicit run metadata opt-in
   `allow_official_kwt_sequence_publication = true`;
6. a strict per-snapshot KWT Season/Week period descriptor;
7. positive slope greater than `0.01`; and
8. non-empty, provenance-valid source references, including KWT identity and
   fingerprint checks and Weekly personal-handicap exclusion.

Thus the proposal cannot expose the existing quarantined or unpublished rows.
It changes only the rating publication view definition and its client grants; it
does not insert, update, delete, truncate, alter tables, or change publication
statuses.

The current index publication view already has the equivalent explicit
`OFFICIAL_KWT_SEQUENCE` opt-in branch and still requires KWT-only personal-round
provenance. This proposal does not widen that index path.

## Local validation

- Phase 101 focused tests: 4/4 passed.
- Phase 102 readiness tests: 4/4 passed.
- Full Handicap suite: 153 passed, 0 failed (including the four Phase 102 readiness tests).
- `npx tsc --noEmit`: passed.
- Targeted ESLint for the Phase 101/102 tests and generator: passed.
- `git diff --check`: passed.
- Disposable PostgreSQL 17.11 official-sequence integration: passed, including
  opt-in exclusion, security-invoker behavior, client denial, and privileged
  view access.

## Exact installation gate

The committed read-only preflight is:

`docs/handicap/phase102/production_readiness_preflight.sql`

Proceed only if its results still match this report and the proposal checksum is
unchanged. Then, in one transaction, execute only:

`supabase/proposals/20261020_handicap_kwt_effective_period_publication_gate.proposed.sql`

No data import, snapshot update, publication, index creation, or unrelated
migration is part of that action.

## Required postflight

Read-only checks must confirm:

- the rating view remains `security_invoker=true`;
- `public`, `anon`, and `authenticated` still lack `SELECT` on both views;
- `service_role` retains the intended read path;
- both calendar-date and explicitly opted-in Season/Week branches are present;
- the two current runs remain `DRAFT`/`QUARANTINED` with opt-in false;
- counts remain 2 runs, 27,944 provenance, 338 ratings, 0 indexes, 0 rows in
  either publishable view, and 0 published ratings/indexes;
- append-only triggers and RLS flags are unchanged; and
- no existing row or historical record changed.

If any preflight differs or the transaction errors, stop and do not improvise a
repair. A transactional DDL failure must abort without changing the live view.

## Remaining risks and next step

The main remaining material risk is operational rather than exposure-related:
the proposal's internal privilege preflight rejects unexpected non-`SELECT`
client grants but does not independently fail on an unexpected pre-existing
client `SELECT` grant. The independent catalog check above found no such grant;
the proposal's final `REVOKE ALL` and the postflight `has_table_privilege` checks
still enforce and verify client denial. If a stricter no-change preflight is
required, the proposal must be amended and re-checksummed before installation.

The trusted `service_role` currently has broader historical DML grants on the
publication views than the view gate needs. This is not client exposure and was
not changed, but it should remain a separately reviewed least-privilege item.

**Recommended next action:** obtain explicit approval for the unchanged,
checksummed proposal, rerun the read-only preflight immediately, execute it once
transactionally, and perform the postflight above. Do not import or publish the
72 rating candidates in the same operation.
