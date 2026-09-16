# Historical Match fixture recovery: Seasons 26–55

This is a source audit and a review-only recovery package. No database command in this package has been run.

## Authoritative source reviewed

- Local workbook: `Match Play .xlsx`
- Workbook SHA-256: `11517EE0CE3AA042AEB0F2D9DD070F1E7301B9CA54B8A18F08D8868C671FCC46`
- Season standings tabs: 26–54
- Embedded opponent-level scorecard tabs: `46sc` and `53sc`
- Separate CSV exports: Seasons 26, 27, 32, 36, 38, and 48–55. These preserve standings and per-course aggregates but do not identify opponents.

The embedded scorecards explicitly identify both players and the course. Difficulty and course order come from the matching season standings tab. Holes-won values come from each named player's preserved per-course season row, not from an inferred round-robin schedule.

## Season audit

| Season | Status | Proven fixtures | Notes |
|---:|---|---:|---|
| 26 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 27 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 28 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 29 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 30 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 31 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 32 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only; the CSV does not identify opponents. |
| 33 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 34 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 35 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 36 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 37 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 38 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 39 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 40 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 41 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 42 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 43 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 44 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 45 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 46 | PARTIAL SOURCE | 20 | Twenty fixtures are tied to scorecard images. One Holiday Hard scorecard has an opponent identity that does not uniquely resolve to the preserved Division 4 standings and is omitted. |
| 47 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 48 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 49 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 50 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 51 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 52 | NO FIXTURE SOURCE FOUND | 0 | Standings/aggregate source only. |
| 53 | COMPLETE SOURCE | 20 | All played totals in all five populated divisions reconcile to the embedded scorecards. |
| 54 | NO FIXTURE SOURCE FOUND | 0 | `54sc` is an empty scorecard template; standings/aggregate source only. |
| 55 | NO FIXTURE SOURCE FOUND | 0 | CSV standings/aggregate source only. |

## Omitted evidence

- Season 46, Division 4, Holiday Hard, workbook image `image41.png`: the screenshot proves SARAHLYNN's opponent and course visually, but the opponent account name cannot be uniquely linked to the preserved Season 46 Division 4 standings. The likely pairing is deliberately not inferred.

## Recovery behavior

`historical_match_fixture_recovery_26_55.sql` is a standalone, later-run artifact. It:

- contains only the 40 source-proven fixtures above;
- resolves exactly one historical import for the same season;
- resolves both participants by the same import, division, source final rank, and preserved historical display name;
- blocks BYE, ambiguous identity, cross-division linkage, duplicate/reversed pairs, and repeated participation in one course;
- treats an already-identical fixture as an idempotent no-op;
- aborts on an existing conflicting fixture;
- inserts missing rows only into `public.historical_match_fixtures`;
- leaves historical standings, Seasons 21–25, and current managed Season 58 outside its target set.

The existing `public.get_public_match_play()` reader already returns valid rows from `public.historical_match_fixtures`, resolving both public names from the linked frozen historical standings. No reader or public Match page change is needed.
