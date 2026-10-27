# Phase 136 Venice Easy lineage recovery

Status: **READY FOR LOCAL DATABASE VALIDATION; PRODUCTION BLOCKED**

## Exact discrepancy

The corrected Phase 68 ledger contains 217 Venice Easy rows and 215 Venice Hard rows. Comparing official player-week keys (Season|Week|canonical_player_id) across both difficulties yields 215 complete Easy/Hard pairs and exactly 2 Easy-only rows. Both rows are listed in venice_easy_lineage_comparison.csv.

The two rows remain preserved in the source provenance ledger. They are unique, have canonical UUIDs and source-player/round metadata, and have no observed duplicate fingerprint or conflicting revision. They are excluded only from the Venice Easy rating population because their official pair is incomplete; this is the complete-pair eligibility rule that produces the candidate sample size of 215. No score, identity, source record, or date was invented or removed.

## Excluded rows

- KWT|KWT11W04|63|VNE|58095 — sarahloo1971 (ec5c8f36-444f-4c7e-8309-f358d0475c27), score -7, KWT11W04.csv#row=59; missing paired Venice_hard for S11W04.
- KWT|KWT4W07|3506|VNE|44429 — DABIGWILLO (6da4e335-3218-4711-b5db-e3faf558e68b), score -13, KWT4W07.csv#row=54; missing paired Venice_hard for S4W07.

## Successor package

- The 16 Phase135 verified successor lineages are carried forward with Phase136 deterministic snapshot IDs.
- Venice Easy is added as successor snapshot 293006d2-2865-5e33-a79f-179627f6e7ff, with 215 exact complete-pair source references, rating -19.577, slope 6.293, and official Season/Week effective-period metadata.
- Total successor snapshots: 17.
- Complete owner-rating mapping: 78/78.
- All 166 rolling-20 candidates revalidated; 0 remain blocked by Venice lineage. Numeric values are unchanged.
- Candidate status distribution: 120 OFFICIAL_ELIGIBLE, 46 PROVISIONAL; all remain UNPUBLISHED and pending explicit approval.
- Weekly personal-index inputs: 0.

## Production boundary

The package is local-only. It proposes one DRAFT / QUARANTINED calculation run and 17 UNPUBLISHED KWT-only rating snapshots. It does not insert provenance, indexes, decisions, approvals, or publication state.
