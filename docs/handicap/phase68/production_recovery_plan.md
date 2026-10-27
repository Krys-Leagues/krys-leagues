# Phase 68 Production recovery plan — approval required

This is a release package, not an executed migration. No Production recovery
SQL is included in this worktree's execution history and no Production rows
were changed by Phase 68.

## Root cause

The temporary Phase 67 compact import encoder built a dictionary from unique
values but assigned indexes using each value's original input position. When a
KWT source-player or canonical-player value repeated, the index pointed past
the end of the unique dictionary. The database accepted the resulting NULL
join values, so all 13,550 KWT rows arrived without canonical UUIDs and with
malformed `KWT|...||...` fingerprints. This was a package-generation defect,
not a source-record or database-identity defect.

## Safe recovery shape

The invalid run and its rows must remain immutable. The local proof appends:

1. One `SOURCE_RECORD` review-evidence row and one `QUARANTINE` decision for
   the invalid Phase 67 calculation run.
2. A new DRAFT calculation run using the same approved policy and mathematical
   model version.
3. The 13,550 corrected KWT provenance rows. The 844 already-valid Weekly
   provenance rows are reused after exact payload comparison; they are not
   duplicated.
4. 169 new deterministic, UNPUBLISHED snapshots referencing the corrected
   run and exact source fingerprints.

No UPDATE, DELETE, TRUNCATE, trigger bypass, RLS bypass, rating publication,
index publication, or legacy-table write is part of this plan.

## Production preflight gate

Before any future execution, read-only checks must confirm:

- The project is `jfbndcwdsvsjgnzwvexp`.
- The invalid run ID is `5a57560c-3548-54a8-879c-8fc516a85f26` and remains
  `DRAFT`.
- It still has 14,394 provenance rows and 169 UNPUBLISHED snapshots.
- Exactly 13,550 KWT rows have the malformed fingerprint/identity pattern and
  844 Weekly rows remain canonical-player-null and personal-handicap-ineligible.
- The six persistence tables, RLS, grants, append-only guards, and review-scope
  constraint match the audited schema.
- Corrected KWT fingerprints do not already exist with a conflicting payload.
- The corrected package checksums match the committed Phase 68 package.
- Legacy counts remain `handicap_rounds=10274`, `course_ratings=32`,
  `handicap_differentials=5518`, and `handicap_index=182`.

Any mismatch aborts before a transaction begins.

## Transaction boundary

The future authorized executor must load the reviewed package into private
temporary staging tables using parameterized COPY/import tooling, validate all
UUIDs, fingerprints, source separation, exact Weekly payload reuse, snapshot
references, review scopes, and deterministic IDs, then execute one transaction.
The transaction must insert only the quarantine evidence/decision, new DRAFT
run, missing corrected KWT provenance, and replacement UNPUBLISHED snapshots.
It must abort on any duplicate, payload conflict, missing reference, invalid
scope, invalid rating, or row-count mismatch.

The SQL proposal must not use the existing invalid rows as an UPDATE target.
Because the installed history tables are append-only, invalid rows are
preserved for audit and excluded by the quarantine decision in the future
review/read contract.

## Postflight gate

Verify exact expected counts after authorization:

- calculation runs: 2 total, with one invalid DRAFT and one corrected DRAFT;
- provenance: 27,944 total (14,394 original plus 13,550 new KWT rows);
- rating snapshots: 338 total (169 original plus 169 corrected), all
  UNPUBLISHED and none effective-dated;
- review evidence/decisions: one new quarantine pair;
- player-index snapshots: zero;
- all corrected KWT rows have canonical UUID and source-player metadata;
- all Weekly rows remain external and personal-handicap-ineligible;
- legacy Handicap counts, RLS, grants, and append-only protections are
  unchanged.

If any postflight check fails, preserve the transaction's atomic failure and
leave the existing Production state unchanged. Do not attempt cleanup with
UPDATE or DELETE.

## Approval boundary

This plan is READY FOR PRODUCTION APPROVAL, not authorized for execution in
the overnight phase. Separate approval is required for the narrowly scoped
Production append-only recovery transaction. Application deployment and any
publication of ratings or indexes remain separate decisions.
