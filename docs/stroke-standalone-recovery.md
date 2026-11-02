# Stroke Play standalone recovery

## Baseline

This application was extracted from the latest intact Stroke Play line found in
the existing Krys Leagues history: commit `7e4fca8bb096` (`Fix Stroke live
board refresh after verification`, 2026-10-06). The public website was then
recovered from the later approved public-board line: `ec53f655` (`Forward-
integrate public league boards for staging`, 2026-10-29), with its protected
canonical-identity reader from `a4a72624` (`Restore approved Stroke public
board presentation`, 2026-09-28). The approved background asset was
introduced by `7a2033a7` (`Install approved Stroke Play artwork`, 2026-09-05).
The extraction preserves the existing Stroke pages, scorecard workflow,
SQL/RPC definitions, artwork, player screen names, and negative-score behavior.

## Recovered behavior

- Four-division Stroke seasons with persistent roster slots and the existing
  player/admin interfaces.
- Three scheduled matches per player in four-player divisions, with the
  existing smaller-division pairing rules and course overrides.
- Stroke scorecards/results where lower scores win and negative integers remain
  valid; points are 3 for a win, 1 for a draw, and 0 for a loss.
- Standings and final scorecards using the approved points, wins, completed
  games, total strokes, and screen-name ordering.
- Final-scorecard approval, historical records/import review, and the existing
  promotion/relegation transition proposal and decision workflow.
- Global Players through the restricted `/api/admin/stroke/players` identity
  interface. It returns canonical identity fields, verified aliases, and
  identity links only; it does not expose unrelated memberships or tournaments.
- The approved public Stroke board is rendered beneath the artwork and reads
  current fixtures, results, standings, and canonical screen names through the
  read-only `/api/public/league-board?kind=stroke` route.
- Public Stroke routes no longer show the optional sign-in overlay, and a
  Discord login preserves a safe requested Stroke destination even when the
  player identity is not yet linked.

## Safety boundary

The standalone Preview must use the existing RLS staging project
`krys-rls-staging` (`jiekoqgegqcbqaobisvm`) and must not receive Production
credentials. No Production database writes, deployments, historical edits, or
release promotion are part of this recovery.

Synthetic records and the extracted test suite are the verification path. The
Production database was inspected read-only only. As of the recovery audit,
Production Stroke season 63 has 21 scheduled fixtures and 21 stored results,
15 standings rows, and 15 final-scorecard entries; its final scorecard is
still a draft and the historical Stroke source-backed tables are empty.
Therefore it is evidence of recovered schema/workflow, not a completed
Production season suitable for release.
