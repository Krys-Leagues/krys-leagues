# Phase 132 rating-decision installation package

Status: **LOCAL PREPARATION ONLY — NOT RECORDED IN PRODUCTION**.

## Verified source

- Target project: `jfbndcwdsvsjgnzwvexp`
- Phase130 checkpoint: `da2d139d63e96e79303da665449bb821a23398a7`
- Phase125 checkpoint: `dfd3558109a6dcbd00703feadd52acb2276dc899`
- Phase130 batch SHA-256: `52D2D88FD821F231148FCCC1C90C85BF32D34FA9156C2A8C2F3D75CD2CF53C0B`
- Phase125 reference SHA-256: `09382A8C7901F549377ADE119E3DF5068CD40A9C8FF9629F572DA5FE7EFB22A6`
- Exact batch comparison: 73/73 rows, identifiers, values, difficulty, source scope, and dependencies match; no missing, added, altered, or duplicate rows.

## Decision boundary

Krys explicitly approved all 73 enumerated rows for formal rating-decision installation. The local owner artifact records the decision without inventing a signature, reviewer UUID, or timestamp. It does not approve indexes, publish ratings, or write Production.

The five prior approvals remain unchanged in the source package. Hollywood Easy/Hard remain `HOLD_PROVISIONAL`; Gloop Lair Easy/Hard remain `HOLD_UNRATED`.

## Exact Production write scope for separate authorization

The installation SQL inserts exactly 73 rows into `handicap_review_evidence` and 73 matching `ACCEPT` rows into `handicap_review_decisions`, protected by the existing append-only contract and a transaction advisory lock. It does not insert or modify ratings, indexes, calculation runs, provenance, player identities, or publication state. Existing decision rows are preserved.

The SQL deliberately uses `SOURCE_RECORD` because that is the installed subject-kind contract; it does not invent a new `COURSE_RATING` subject type. The evidence payload carries the exact snapshot ID and rating details for audit.

## Required separate authorization and execution order

1. Review the local owner artifact and approve the 73-row rating-decision installation only.
2. Execute `production_rating_decision_preflight.sql` read-only against the named project.
3. Verify the installation SQL checksum and preflight output.
4. Execute only `production_rating_decision_installation.sql` in one session/transaction. Any conflict must abort the transaction.
5. Execute `production_rating_decision_postflight.sql` read-only.
6. Keep ratings and indexes unpublished; rating/index publication and website release require separate authorization.

## Expected postflight

- Calculation runs: 4 (unchanged)
- Provenance rows: 28,672 (unchanged)
- Rating snapshots: 410 (unchanged, all unpublished)
- Index snapshots: 157 (unchanged, all unpublished)
- Review evidence: 74 total (1 existing + 73 new)
- Review decisions: 74 total (1 existing + 73 new)
- Publishable ratings/indexes: 0/0
- Weekly personal-index inputs: 0

No Production decision has been recorded by this package yet.
