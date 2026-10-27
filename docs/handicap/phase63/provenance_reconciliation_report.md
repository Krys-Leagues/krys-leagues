# Phase 63 provenance reconciliation

This is a local, read-only-generated import package. It performs no Production writes.

## Evidence accounting

- Phase 61 snapshots referenced: **169**.
- Unique source fingerprints referenced: **14394**.
- Exact provenance records recovered: **14394**.
- Missing or conflicting fingerprints: **0**.
- Import-ready snapshots: **169**.
- Blocked snapshots: **0**.
- Weekly provenance rows retain canonical_player_id = NULL and personal_handicap_eligible = false.
- No source dates were invented; all unavailable dates remain NULL.

## Import order

1. One DRAFT calculation run.
2. Exact source provenance rows.
3. Unpublished rating snapshots whose every source fingerprint is verified.

The plan must abort on any duplicate fingerprint conflict, missing provenance, source-type mismatch, Weekly identity link, course/difficulty mismatch, or UUID/payload conflict. It must not insert player-index snapshots or touch legacy Handicap tables.

## Exceptions

None.
