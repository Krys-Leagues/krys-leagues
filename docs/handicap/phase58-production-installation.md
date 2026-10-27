# Phase 58 Handicap policy and installation gate

This document locks the approved local calculation policy and defines the
future Production installation boundary. It is preparation only. It does not
install tables, import rounds, rebuild indexes, publish ratings, or deploy the
application.

## Approved calculation contract

- Model version: `krys-handicap-candidate-a-v1`
- Differential: `(score - course rating) * 8.515 / course slope`
- Reference slope: `8.515`, stored as a versioned model parameter
- Near-zero slope rejection: slope must be greater than `0.01`
- Latest window: 10 eligible rounds
- Best window: 5 differentials averaged
- Minimum index rounds: 5
- Publication requires exact verified chronology; all other chronology is
  preview-only
- Easy and Hard are separate course keys
- Negative golf scores are valid; invalid scores, missing ratings, and invalid
  slopes fail closed

Rating readiness is less than 20 qualifying rounds: `UNRATED`; 20–49:
`PROVISIONAL`; 50 or more: potentially `READY`, subject to at least 20
distinct verified players, no player contributing more than 10%, valid slope,
and unresolved-source review.

## Source boundary

- `KWT` and `APPROVED_PERSONAL` may contribute to personal Handicap history
  when identity, eligibility, and chronology requirements are met.
- `THE_WEEKLY` is course-rating/slope evidence only and is rejected by the
  approved personal-calculation entry point.
- Mighty Cocobot records remain benchmark evidence only.
- Exact fingerprint duplicates are counted once; conflicts are quarantined;
  similar scores do not establish duplication.

The approved entry point is `calculateApprovedHandicapSnapshot` in
`lib/handicap/engine.ts`. Legacy and research models remain available only for
comparison and are not the publication path.

## Production preflight (read-only)

Run the catalog-only preflight from
`docs/handicap/phase44-schema-preflight-readonly.sql`, plus the following
read-only checks against the Production project:

```sql
select
  c.relname,
  pg_get_userbyid(c.relowner) as owner_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_catalog.pg_class as c
join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'handicap_rounds',
    'handicap_calculation_runs',
    'handicap_rating_snapshots',
    'handicap_index_snapshots',
    'handicap_review_evidence',
    'handicap_review_decisions',
    'handicap_source_provenance'
  )
order by c.relname;

select count(*)::bigint as handicap_rounds_count
from public.handicap_rounds;
```

Before installation, stop if any proposed table already exists with a
definition, owner, constraint, trigger, RLS, or grant that differs from
`supabase/proposals/20261018_handicap_review_snapshots.proposed.sql`. The
legacy `public.handicap_rounds` table and its rows are preserved.

## Installation sequence (future authorized operation)

1. Capture and review the read-only preflight output and migration history.
2. Back up the catalog definition and record counts for legacy Handicap
   tables; do not use the old destructive rebuild functions.
3. Have the exact proposal reviewed as a schema installation, including its
   `service_role` grants, no client policies, and append-only triggers.
4. Apply `supabase/proposals/20261018_handicap_review_snapshots.proposed.sql`
   transactionally only after separate Production authorization.
5. Postflight-check table definitions, RLS, `FORCE RLS = false`, grants,
   trigger definitions, and unchanged legacy row counts.
6. Load only reviewed provenance and immutable draft rating snapshots through
   a controlled service-role process. Keep Weekly evidence out of personal
   round and index inputs.
7. Run protected admin review and privacy checks before any publication.
8. Publish only approved course versions and exact-chronology player index
   snapshots. Leave provisional, unrated, conflicted, or uncertain records
   unpublished.
9. Deploy the application separately, after a complete candidate build and
   compatibility check against the live source baseline.

## Stop conditions and recovery

Stop before execution on any schema mismatch, unexpected existing table,
permission difference, missing canonical player foreign-key target, failed
append-only trigger check, or unavailable transaction-capable migration path.

If installation fails, preserve the existing healthy Production deployment and
do not run a destructive rollback or rebuild. Reconcile the exact catalog
difference locally, revise the proposal as a new review artifact, and repeat
the preflight. No data repair or identity merge is part of this gate.

## Current Phase 58 evidence

The verified Production preflight found `public.handicap_rounds` with owner
`postgres`, RLS enabled, and `FORCE ROW LEVEL SECURITY` disabled. It contained
10,274 rows at the time of inspection. The six proposed snapshot/review tables
were absent, so the persistence proposal remains unapplied. No Production
write was performed.

The supported local course evidence remains 78 entries with local/provisional
diagnostics. BHE, BHH, and GLE may be re-evaluated from verified newer
course-only evidence; GLH remains unrated until it meets the evidence gate.
No local simulation is an approved Production rating until it passes the
locked readiness checks.
