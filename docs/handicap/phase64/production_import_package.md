# Phase 64 import package

This package is prepared for review only. No Production write was executed.

## Inputs

- `../phase63/calculation_run_import_manifest.json`
- `../phase63/handicap_source_provenance_import.csv`
- `../phase63/rating_snapshot_import_manifest.json`
- `../phase63/transactional_import_plan.json`

Expected payload:

- one `DRAFT` calculation run
- 14,394 exact source-provenance rows
- 169 `UNPUBLISHED` rating snapshots
- 158 `ready` and 11 `provisional` snapshots
- zero index snapshots
- null `effective_from` for every snapshot

## Phase 64 validation result

The package is not currently import-ready against the installed Production schema. The installed unique constraint is:

```text
UNIQUE (calculation_run_id, course_id, difficulty, model_version)
```

The 169-row package has 81 distinct keys under that constraint and 88 conflicting rows. The rows have different deterministic IDs and, in many groups, different evidence scopes and values. Therefore the correct behavior is to abort the transaction, not to use `ON CONFLICT`, skip rows, or overwrite history.

The local harness proved that the transaction rolls back to zero calculation runs, provenance rows, and rating snapshots when this conflict is encountered.

## Required reconciliation before any Production import

One of these contracts must be reviewed and explicitly approved:

1. Preserve all 169 snapshots by extending the persistence identity to include the package's review/source scope (the package currently carries `review_scope`, but the installed table does not); or
2. Rebuild the reviewed package to one snapshot per installed uniqueness key, with an auditable decision about which scope is authoritative; or
3. Use separate calculation runs/model versions for the independent scopes, if that is the intended historical-version contract.

No choice is made by Phase 64. Existing Production schema and data remain unchanged.

## Execution gate

Do not execute the import until the chosen contract is reconciled, the package is regenerated or the schema is separately approved, and a fresh read-only preflight confirms the exact target schema. The read-only preflight is in `production_import_preflight.sql`; the postflight assertions are in `production_import_postflight.sql`.
