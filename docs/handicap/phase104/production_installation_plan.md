# Phase 104 controlled installation plan

This package is local-only. No Production rows were inserted.

## Exact package

- Package: `phase104-first-eligible-kwt-handicap-run-v1`
- Run: `3973f8e7-f2c9-5d05-bdb7-e49810713612`
- Run state: `DRAFT / QUARANTINED`
- Ratings: 72 ready KWT-only snapshots, all `UNPUBLISHED`
- Indexes: 157 KWT-only candidates, all `UNPUBLISHED`
- Provisional ratings excluded: 6
- Blocked players: 44

## Installation order (future approval required)

1. Read-only preflight confirms project identity, Phase 103 gate, all source fingerprints, UUIDs, package checksums, empty target run/snapshot IDs, and unchanged legacy counts.
2. Begin one transaction and acquire the reviewed advisory lock.
3. Insert the DRAFT/QUARANTINED calculation run with explicit KWT-only scope and opt-in metadata.
4. Validate that all source evidence references already exist and are KWT with canonical UUIDs; do not insert or alter provenance in this package.
5. Insert 72 rating snapshots with NULL calendar dates, validated Season/Week effective periods, `KWT_ONLY`, and `UNPUBLISHED`.
6. Insert 157 index snapshots with remapped Phase 104 rating IDs, `OFFICIAL_KWT_SEQUENCE`, and `UNPUBLISHED`.
7. Assert exact counts, source separation, foreign-key integrity, no Weekly index references, and no publication state.
8. Commit; otherwise abort the entire transaction on any mismatch.

## Prohibited

No UPDATE, DELETE, TRUNCATE, migration, legacy-table write, rating publication, index publication, player identity change, or historical-score change.

## Postflight

Expect the two pre-existing quarantined runs and the new quarantined run to remain non-publishable; all imported rows remain unpublished; publishable views remain empty; legacy Handicap counts remain unchanged; Weekly provenance remains excluded from personal indexes.

## Failure handling

Any duplicate ID, missing source fingerprint, invalid UUID, invalid period, non-KWT reference, foreign-key failure, or publication-state mismatch aborts the transaction. Do not repair in place or rerun without a new read-only preflight.
