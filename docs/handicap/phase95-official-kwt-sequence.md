# Phase 95 official KWT sequence review

## Verified package result

The corrected Phase 68 KWT package was checked locally and the Production gate was checked read-only.

| Measure | Result |
| --- | ---: |
| Corrected KWT provenance rows | 13,550 |
| Canonical players | 201 |
| Player-week groups | 6,776 |
| Complete Easy/Hard pairs | 6,774 |
| Complete KWT rows usable for sequence preview | 13,548 |
| Incomplete player-weeks | 2 |
| Duplicate difficulty groups | 0 |
| Unique source fingerprints | 13,550 |
| Negative scores preserved | 12,463 |

The two incomplete groups are:

- canonical player `ec5c8f36-444f-4c7e-8309-f358d0475c27`, Season 11 Week 4 — Easy only;
- canonical player `6da4e335-3218-4711-b5db-e3faf558e68b`, Season 4 Week 7 — Easy only.

They remain excluded from the official-pair sequence preview. No missing Hard score was invented.

## Chronology classification

`OFFICIAL_KWT_SEQUENCE` means:

1. the official result identifies one Easy and one Hard result for the same canonical player and season/week;
2. the source rules establish Easy before Hard;
3. the three-minute rule is retained as tournament-rule provenance only; and
4. no exact calendar timestamp is asserted.

It is intentionally distinct from `EXACT` / `EXACT_TIMESTAMP`.

The local sequence preview classified all 201 players as `OFFICIAL_KWT_SEQUENCE`. The prior PERIOD_ONLY preview classified all 201 as `PERIOD_WINDOW`.

## Local calculation comparison

Using the approved Candidate A differential, KWT-only rating snapshots, and the existing latest-10/best-5 engine:

- 13,548 rounds had matching approved local rating snapshots;
- 158 players produced numeric local index previews;
- 43 players lacked the minimum five eligible rounds;
- 158 unpublished index snapshot candidates were produced;
- numeric index values changed for 0 players;
- selected latest-round sets changed for 0 players;
- chronology status changed for 201 players only.

The existing Production publication gate remains unchanged and therefore rejects these previews because it currently requires exact timestamp chronology. No index was inserted or published.

## Proposed policy change for review only

A future narrowly scoped policy revision could permit `OFFICIAL_KWT_SEQUENCE` for KWT-only index publication when all of the following are true:

- the player-week has exactly one verified Easy and one verified Hard result;
- both source fingerprints and the canonical player UUID are present;
- no duplicate or conflicting pair exists;
- latest-10/best-5 selection is deterministic under Season → Week → Easy → Hard;
- the calculation run explicitly opts into the revised chronology policy; and
- the resulting index remains versioned and auditable.

This would be a publication-policy decision, not a mathematical change. It must be reviewed and installed separately. The three-minute rule must not be represented as an exact timestamp.

## Production read-only state

Production still reports 2 calculation runs, 27,944 provenance rows, 338 unpublished rating snapshots, 0 index snapshots, and 0 rows in either publishable view. No Production changes were made.
