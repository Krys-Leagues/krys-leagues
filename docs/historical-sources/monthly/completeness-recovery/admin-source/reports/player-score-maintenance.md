# Read-only Player League Maintenance discovery

Capture date: 2026-09-07

From a current-period leaderboard `Edit` link, the authenticated application opened a `Player League Maintenance` dialog. The dialog was inspected and closed without changing or submitting anything.

## Selector items and regions

- Monthly item: `P5_MONTHLY_ID`
- League item: `P5_LEAGUE_ID`
- Player item: `P5_PLAYER_ID`
- Scores report region: `R85296253175858605`
- Scores report columns: `RN`, `COURSE`, `SCORE`, `HN1`, `CREATED_ON_SINCE`
- Score detail dialog: `Change High Score`
- Score detail items: `P16_PLAYER_SELECTOR`, `P16_SCORE`, `P16_ACES`

The Monthly selector exposed January 2024 through October 2026 plus November 2026, December 2026, and January 2027. The League selector exposed all 14 admin labels: Master, Elite, Pro 1, Pro 2, Pro 3, Semi Pro 1, Beginner, Welcome, Semi Pro 2, Semi Pro 3, Semi Pro 4, Amateur 1, Amateur 2, and Amateur 3.

## Current sample only

The existing current state was 2026 September / Master / `PETERK9FLORIDA`. The Scores report displayed 7 rows, with courses and exact score text:

| Course | Score | HN1 |
|---|---:|---:|
| Mount Olympus | -23 | 2 |
| Widow’s Walkabout | -21 | 4 |
| Laser Lair | -20 | 4 |
| Laser Lair - Hard | -19 | 5 |
| Blokhaven | -19 | 5 |
| Mount Olympus - Hard | -17 | 0 |
| Blokhaven - Hard | -15 | 1 |

The absent eighth course row was not treated as a missing-score observation because this admin report only returned seven score records for this player. No source record ID was displayed. This sample is current/in-progress data and is not counted as finalized historical recovery.

The score links open a mutation-capable `Change High Score` dialog with Save/Delete controls. Those controls were not used.

## Recovery implication

This is a database-backed per-player/period/division score report, but the observed UI exposes no “all players/all periods/all divisions” export from this dialog. A complete admin recovery would require systematic read-only traversal of player × period × division selections or discovery of the underlying report endpoint. The available CUA browser surface exposes no CDP Network or Browser download-behavior API, so `Network.getResponseBody` and `Browser.setDownloadBehavior` could not be invoked.
