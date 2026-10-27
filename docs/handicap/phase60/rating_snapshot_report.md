# Phase 60 rating snapshot preparation

## Status

This is a local, deterministic, unpublished evidence package. No rows were inserted into Production, no legacy Handicap records were rewritten, and no player-index snapshots were created. Every generated rating row has `publicationStatus=UNPUBLISHED` and `publicationEligible=false`.

## Evidence accounting

- KWT source rows read: **14358** course observations from the verified normalized KWT archive.
- KWT course observations accepted after exact identity/course/score checks: **13550**.
- KWT evidence quarantined: **808**, principally unresolved canonical identity rows.
- Weekly source rows read: **844**, matching the preserved Phase 54 total of **844** verified observations.
- Weekly validation rejects in this run: **0**.
- Weekly rows remain course-rating/slope-only; they cannot enter personal Handicap rounds, differentials, or indexes.
- Generated snapshot rows: **169** across the three source scopes. Status counts: POTENTIALLY_READY: 158, PROVISIONAL: 11.

The Production preflight also confirmed that the six Phase 59 tables are empty and that the 10,274 legacy `handicap_rounds` rows currently have no canonical `player_id`. Those legacy rows were not copied into this package. The local KWT archive is therefore the only KWT input used here, and unresolved identities remain quarantined rather than guessed.

No exact effective date was supplied by the reviewed evidence. All snapshots use `effectiveFrom=null` and retain an explicit period description instead of inventing a date.

## Priority-course preview

| Scope | Code | Difficulty | Samples | Distinct source players | Course rating | Slope | Confidence |
|---|---|---:|---:|---:|---:|---:|---|
| KWT_ONLY | BHE | easy | 0 | 0 | — | — | UNRATED |
| WEEKLY_ONLY | BHE | easy | 85 | 85 | -21.818 | 5.512 | POTENTIALLY_READY |
| KWT_PLUS_WEEKLY | BHE | easy | 85 | 85 | -21.818 | 5.512 | POTENTIALLY_READY |
| KWT_ONLY | BHH | hard | 0 | 0 | — | — | UNRATED |
| WEEKLY_ONLY | BHH | hard | 80 | 80 | -20 | 7.3 | POTENTIALLY_READY |
| KWT_PLUS_WEEKLY | BHH | hard | 80 | 80 | -20 | 7.3 | POTENTIALLY_READY |
| KWT_ONLY | GLE | easy | 0 | 0 | — | — | UNRATED |
| WEEKLY_ONLY | GLE | easy | 92 | 92 | -28.25 | 7.63 | POTENTIALLY_READY |
| KWT_PLUS_WEEKLY | GLE | easy | 92 | 92 | -28.25 | 7.63 | POTENTIALLY_READY |
| KWT_ONLY | GLH | hard | 0 | 0 | — | — | UNRATED |
| WEEKLY_ONLY | GLH | hard | 0 | 0 | — | — | UNRATED |
| KWT_PLUS_WEEKLY | GLH | hard | 0 | 0 | — | — | UNRATED |
| KWT_ONLY | HWE | easy | 46 | 46 | -21.167 | 7.754 | PROVISIONAL |
| WEEKLY_ONLY | HWE | easy | 0 | 0 | — | — | UNRATED |
| KWT_PLUS_WEEKLY | HWE | easy | 46 | 46 | -21.167 | 7.754 | PROVISIONAL |
| KWT_ONLY | HWH | hard | 46 | 46 | -16.667 | 13.428 | PROVISIONAL |
| WEEKLY_ONLY | HWH | hard | 92 | 92 | -17.333 | 7.801 | POTENTIALLY_READY |
| KWT_PLUS_WEEKLY | HWH | hard | 138 | 138 | -17.294 | 9.859 | POTENTIALLY_READY |
| KWT_ONLY | FFE | easy | 62 | 62 | -28.75 | 8.234 | POTENTIALLY_READY |
| WEEKLY_ONLY | FFE | easy | 0 | 0 | — | — | UNRATED |
| KWT_PLUS_WEEKLY | FFE | easy | 62 | 62 | -28.75 | 8.234 | POTENTIALLY_READY |
| KWT_ONLY | FFH | hard | 62 | 62 | -15.75 | 10.089 | POTENTIALLY_READY |
| WEEKLY_ONLY | FFH | hard | 0 | 0 | — | — | UNRATED |
| KWT_PLUS_WEEKLY | FFH | hard | 62 | 62 | -15.75 | 10.089 | POTENTIALLY_READY |
| KWT_ONLY | RCH | hard | 152 | 78 | -13.895 | 12.197 | POTENTIALLY_READY |
| WEEKLY_ONLY | RCH | hard | 79 | 79 | -16.3 | 9.363 | POTENTIALLY_READY |
| KWT_PLUS_WEEKLY | RCH | hard | 231 | 157 | -15.214 | 11.725 | POTENTIALLY_READY |

These are simulations under the approved lowest-12%-elite benchmark and Candidate A metadata (reference slope **8.515**). They are not official ratings. GLH remains UNRATED because this package has no independently verified GLH evidence.

## Import gate

The next executable step is a separately authorized, read-only-reviewed import of only approved snapshot rows after comparing this manifest against the installed six-table schema. That step must create a calculation-run record and append-only provenance/snapshot rows transactionally; it must not import Weekly rows into personal Handicap history, create index snapshots, or publish any player Handicap.
