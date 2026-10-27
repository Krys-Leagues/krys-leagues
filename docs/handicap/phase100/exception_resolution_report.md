# Phase 100 rating approval blocker resolution

Status: **PARTIAL — source exclusions are resolved as documented quarantine; formal effective-period and approval gates remain.**

## Evidence classification

| Exception | Count | Effect | Resolution |
|---|---:|---|---|
| UNRESOLVED_CANONICAL_ID | 806 | Blocks those rows from identity, chronology, and rating use | Preserved and quarantined; no identity guessed |
| INVALID_SCORE | 2 | Blocks those rows from scoring and rating use | Preserved and quarantined; no score repaired |
| Corrected-package conflicts | 0 | Would block affected rating | None found |

All 808 historical exception fingerprints are absent from the corrected 13,550-row Phase 68 KWT package. The corrected package has 13,550 canonical UUID-backed KWT rows, so the Phase 99 `UNRESOLVED_SOURCE_EXCEPTIONS` label is a stale aggregate of excluded historical observations rather than an unresolved reference inside the 78 rating snapshots. The 808 rows remain auditable and excluded.

The 72 ready ratings are therefore not mathematically invalidated by those rows. They retain the source-exception count for audit visibility, but a future approval manifest can replace that blocker with `HISTORICAL_EXCLUSIONS_DOCUMENTED_NOT_REFERENCED` after review.

## Effective-period evidence

Each rating's manifest now records observed KWT Season/Week ranges and the exact source periods used. These are competition-period metadata under `OFFICIAL_KWT_SEQUENCE`; they are not calendar dates and are not used to fabricate `effective_from`. The effective date remains NULL.

The complete period manifest is in `rating_effective_period_manifest.csv`. It covers all 78 KWT-only ratings, with 72 marked READY_FOR_FORMAL_REVIEW and six PROVISIONAL_HOLD.

## Investigate ratings

The four Phase 99 diagnostic ratings were recomputed from their corrected source references:

- **Bogey's Bonanza_hard**: n=224, mean=-9.089, median=-11, SD=9.637, range=-28 to 18, elite-27 mean=-22.444, manifest rating=-22.444, slope=13.355. LEGITIMATE DISTRIBUTION REVIEW REQUIRED NO SOURCE OR CALCULATION DEFECT FOUND.
- **Forgotten Fairyland_easy**: n=62, mean=-20.516, median=-21, SD=6.037, range=-31 to 2, elite-8 mean=-28.75, manifest rating=-28.75, slope=8.234. LEGITIMATE DISTRIBUTION REVIEW REQUIRED NO SOURCE OR CALCULATION DEFECT FOUND.
- **Original Gothic_easy**: n=180, mean=-16.228, median=-17, SD=3.678, range=-22 to 3, elite-22 mean=-20.591, manifest rating=-20.591, slope=4.363. LEGITIMATE DISTRIBUTION REVIEW REQUIRED NO SOURCE OR CALCULATION DEFECT FOUND.
- **Shangri-La_easy**: n=122, mean=-22.082, median=-24, SD=6.195, range=-33 to 5, elite-15 mean=-30.067, manifest rating=-30.067, slope=7.985. LEGITIMATE DISTRIBUTION REVIEW REQUIRED NO SOURCE OR CALCULATION DEFECT FOUND.

The unusual values are reproducible from legitimate score distributions and the approved elite-lowest-12% methodology. No missing score, invalid slope, duplicate fingerprint, source-reference mismatch, or formula drift was found. These four remain flagged for human review because unusual values should not be auto-approved.

## Policy and source preservation

- Candidate A remains `(score - course rating) * 8.515 / course slope`.
- Model version remains `krys-handicap-candidate-a-v1`.
- Negative scores remain valid.
- Easy and Hard remain independent.
- OFFICIAL_KWT_SEQUENCE remains the chronology classification.
- Weekly evidence remains excluded from personal indexes.
- The six provisional ratings remain ineligible.
- No historical names, UUIDs, scores, or dates were changed.

## Recalculation result

No recalculation was required. The corrected KWT fingerprint set used by the 78 ratings is unchanged and all referenced fingerprints resolve. Expected index candidates remain **157**, with zero Weekly rows and zero value changes.

## Remaining blockers

1. Formal review approval is still required for the 72 ready ratings.
2. A supported effective-period publication convention must be selected. This package supplies season/week periods without inventing calendar dates, but does not silently remove the installed effective-date gate.
3. The four diagnostic ratings require explicit reviewer disposition.
4. The six provisional ratings remain on HOLD until they reach the approved evidence threshold.

No Production change is proposed or executed.
