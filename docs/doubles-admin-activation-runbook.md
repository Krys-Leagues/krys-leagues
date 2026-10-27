# Doubles Admin Activation Runbook

Preparation only. This runbook does not create a season, enroll teams, publish fixtures, or write Production data.

## Required decisions from Krys

The operator must explicitly choose:

- official season number/name;
- start and end dates and any due-date policy;
- participating canonical teams;
- division membership and order within each division;
- home/away course assignments for each fixture;
- match/fixture format and game numbering;
- fixture due dates and publication timing;
- whether Discord board publication is required for this season;
- finalization and historical-publication timing.

There is no safe default that enrolls all 24 canonical teams. The historical Season 1 teams and current global teams are identity evidence, not authorization to enroll them in a new season.

## Existing controls

| Operation | Existing path | Readiness |
| --- | --- | --- |
| Create shared season row | `/admin/season-manager` | Present, but requires explicit season decisions and writes the shared `seasons` table |
| Read canonical players/teams | `/admin/doubles/teams` and protected roster API | Present and admin-protected |
| Create global canonical team | `/admin/doubles/teams` | Present; do not recreate existing teams |
| Assign team to managed season | `/admin/doubles/teams` and `create_doubles_managed_season_team` | Present, requires a real season and explicit choices |
| Create/update private fixture | `/admin/doubles/schedule` | Present |
| Publish/unpublish fixture | `/admin/doubles/schedule` | Present; publication checks four active members |
| Submit participant scorecard | protected Doubles scorecard route | Present for the current managed workflow |
| Admin review/correction | `/admin/doubles/review` and `/admin/doubles/results` | Present |
| Rebuild standings | `rebuild_doubles_managed_standings` through protected result flow | Present |
| Generate/approve/finalize final scorecard | `/admin/doubles/final-scorecard` | Source/runtime present locally, but required completion tables/functions are not in Production |
| Final lifecycle snapshots | proposed completion dependencies/runtime | Not installed; requires separate reviewed schema approval |
| Discord board mapping | `/admin/doubles/boards` and current Discord mapping family | Present in the current generation, but completion runtime mapping ownership needs reconciliation |

## Safe activation order after schema approval

1. Create exactly one official season using Krys-approved number, dates, and course policy.
2. Confirm the season UUID, `league_type = 'doubles'`, and dates before adding any team.
3. Select only the approved canonical global teams. Confirm each team has two distinct canonical players.
4. Assign each selected team to exactly one division and explicit order position.
5. Verify season members: four distinct active players per fixture pairing, with no player assigned to two active teams in the same season.
6. Create private fixtures with explicit home/away teams, actual courses, game numbers, and due dates.
7. Review the fixture preview and roster before publication.
8. Publish only reviewed fixtures. The public `/doubles` reader will show only published `SCHEDULED`, `LIVE`, or `COMPLETED` fixtures.
9. Verify participant scorecard submission, evidence privacy, correction workflow, and admin authorization with a real approved fixture.
10. Verify each completed result, rebuild standings, and confirm the public reader shows only verified/published information.
11. After every required fixture is complete, generate and review the final scorecard.
12. Approve the final scorecard with an audit note, then finalize once.
13. Verify one final snapshot per division and a historical lifecycle state. Repeat the finalize call to prove no duplicate snapshots.

## Explicit non-actions

- Do not use the legacy Season 203 fixture as a current season.
- Do not copy historical Season 1 rows into managed tables.
- Do not create placeholder fixtures, scores, or standings.
- Do not publish a fixture without four valid active canonical members.
- Do not expose private evidence or admin controls through the public reader.
- Do not alter `/doubles-standings`, historical names, team identity, or historical results.
