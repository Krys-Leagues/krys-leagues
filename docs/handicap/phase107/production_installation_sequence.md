# Phase 107 — future Production installation sequence

This is a reviewed procedure only. It was not executed in Phase 107.

## Required approvals

Before any Production action, obtain and checksum a new Phase 107 approval package containing:

1. 72 rating approvals keyed to the Phase 105 source snapshot IDs;
2. four separate diagnostic dispositions for Bogey's Bonanza Hard, Forgotten Fairyland Easy, Original Gothic Easy, and Shangri-La Easy;
3. 157 independent player-index approvals;
4. the reviewed Phase 98 → Phase 104 rating-ID alias map;
5. hashes for each manifest and the exact source package;
6. confirmation that no provisional rating or blocked player is included.

No statistical-readiness flag is an approval substitute.

## Read-only Production preflight

Confirm the target Supabase project, the Phase 105 source run, current counts, publication-gate definitions, security-invoker view options, client grants, append-only triggers, foreign keys, and absence of the deterministic Phase 107 publication-run ID. Confirm the source run and all source snapshots remain `DRAFT`/`QUARANTINED`/`UNPUBLISHED`.

Abort on any mismatch. Do not repair or delete rows in the preflight.

## Transactional installation

Using the separately reviewed executor and one PostgreSQL session:

1. acquire `pg_advisory_xact_lock` for the Phase 107 publication key;
2. re-check package hashes, source-run linkage, approval coverage, KWT-only evidence, canonical UUIDs, rating aliases, chronology opt-in, valid slopes, and absence of the target IDs;
3. insert one new `COMPLETED`/`ELIGIBLE` calculation run with the approval hashes and policy metadata;
4. insert 72 immutable `PUBLISHED` rating successors with `effective_from = NULL` and validated KWT Season/Week periods;
5. insert 157 immutable `PUBLISHED` index successors whose rating arrays point to those new rating IDs;
6. assert exact counts, publication view counts, Weekly exclusion, and source-run preservation;
7. commit only after every assertion succeeds.

The transaction must contain no `UPDATE`, `DELETE`, `TRUNCATE`, migration, rebuild call, or legacy-table write. Any error aborts the whole transaction.

## Player-read installation

Install `supabase/proposals/20261020_handicap_player_read_rpc.proposed.sql` separately, after the publication transaction has been reviewed. It must pass its own schema preflight, retain `SECURITY DEFINER` with an empty `search_path`, grant EXECUTE only to `authenticated`, and leave direct client view/table access denied.

## Postflight

Verify the new run and successor counts, publication-view counts, immutable source counts, zero Weekly personal-index references, canonical identity binding, anonymous denial, cross-player denial, service-role view access, and unchanged website/database objects. Do not enable the player UI until both the rating approval and index approval records are independently reviewed.

If any postflight fails, stop and preserve the prior Production state. No rollback by mutation is permitted; the transaction must have failed before commit.
