# KWT Season 15 Week 1 Kiwi Achievement Audit

Event: `KWTS15W01` · Course: Raptor Cliffs · Easy `RCE` · Hard `RCH`

## Scope and evidence

- Audited the 46 committed rows in `kwt_current_import_rows` for the owner-approved batch `7fa2019b-3773-41a3-99cc-a591bda36476`.
- Used the original `easy_holes` and `hard_holes` arrays, the authoritative RCE/RCH hole pars, and the canonical player IDs on the committed rows.
- Kiwi eligibility is independent of NET eligibility, Handicap Index, division, placement, and points.
- Bogey-free means no original hole score is greater than its authoritative par. Incomplete or invalid cards do not qualify.

## Result

15 of 46 players earned at least one Kiwi achievement. Three earned all three badges. The committed import rows currently contain an empty `badges` array for all 46 players, and the read-only Production audit found zero rows in `player_community_badges` for Kiwi/Coconut badges.

| Canonical player | Division | Easy | Hard | Easy bogeys | Hard bogeys | Verified achievements | Stored import badges | Previous public code path |
|---|---|---:|---:|---:|---:|---|---|---|
| ZANETTI | Elite | -24 | -21 | 0 | 0 | Green Kiwi, Gold Kiwi, Coconut | none | Coconut only |
| MINI_G | Elite | -23 | -17 | 0 | 0 | Green Kiwi, Gold Kiwi, Coconut | none | none |
| EL JORGE | Elite | -23 | -14 | 0 | 1 | Green Kiwi | none | none |
| INDY | Elite | -20 | -17 | 0 | 0 | Green Kiwi, Gold Kiwi, Coconut | none | none |
| leanin2it | Elite | -23 | -14 | 0 | 1 | Green Kiwi | none | none |
| YANKEEDUDE1123 | Elite | -28 | -6 | 0 | 5 | Green Kiwi | none | none |
| YUK1N | Elite | -20 | -9 | 0 | 2 | Green Kiwi | none | none |
| PRINCESS_BANKSHOT | Elite | -18 | -7 | 0 | 2 | Green Kiwi | none | none |
| The Real JB | Pro | -15 | -9 | 0 | 2 | Green Kiwi | none | none |
| BLUTES87 | Elite | -20 | -3 | 0 | 4 | Green Kiwi | none | none |
| CHIPNPUTT | Pro | -20 | -3 | 0 | 4 | Green Kiwi | none | Green Kiwi |
| LAURENT | Pro | -18 | -5 | 0 | 4 | Green Kiwi | none | Green Kiwi |
| GOMARINO13 | Elite | -20 | -1 | 0 | 3 | Green Kiwi | none | none |
| deebee | Pro | -15 | -5 | 0 | 4 | Green Kiwi | none | none |
| LARRYR | Pro | -17 | 0 | 0 | 6 | Green Kiwi | none | none |

The remaining 31 players were correctly excluded because their original Easy or Hard card contained at least one bogey. No NET-only or handicap-adjusted value was used.

## PRINCESS_BANKSHOT evidence

Canonical player: `PRINCESS_BANKSHOT` · ID `cb01e4af-b57b-4424-a00f-7697f1c5f90f`.

Original Easy holes:

`2, 3, 1, 2, 3, 1, 2, 2, 3, 3, 2, 2, 2, 3, 2, 2, 3, 3`

RCE pars:

`3, 3, 3, 3, 3, 2, 3, 4, 4, 3, 3, 4, 3, 4, 3, 3, 3, 5`

The card is `-18` relative to par and has zero holes above par, so Green Kiwi is earned. Its Hard card is `-7` with two bogeys, so it does not earn Gold Kiwi or Coconut.

## Root cause

The original Week 1 runtime used `verifiedWeek01Badges`, a three-entry hardcoded manifest, instead of deriving achievements from the committed original cards. The committed import also preserved empty source badge arrays, and no weekly Kiwi ownership rows existed in `player_community_badges`. The result was a calculation/storage/display gap: the source cards were correct, but the public NET page could only show the three hardcoded entries and the championship page had no verified scorecard-achievement feed.

## Isolated correction

The isolated candidate now:

1. Calculates Green Kiwi, Gold Kiwi, and Coconut from the authoritative 18-hole cards and RCE/RCH pars.
2. Uses no NET, Handicap, division, placement, or points inputs for eligibility.
3. Applies the same verified calculation to the public KWT NET badge display.
4. Adds a verified scorecard-achievements section to the KWT championship page API/UI.
5. Leaves the original scorecards, official results, player identities, and NET calculations unchanged.
6. Keeps the championship article in its existing draft/approval workflow.

No Production write, migration, award publication, or deployment was performed. A future idempotent data backfill, if desired, should be separately reviewed; it is not required for the read-only derived display fix and is not included in this candidate.

