# Stroke Play standalone recovery

## Baseline

This application was extracted from the latest intact Stroke Play line found in
the existing Krys Leagues history: commit `7e4fca8bb096` (`Fix Stroke live
board refresh after verification`, 2026-10-06). The extraction preserves the
existing Stroke pages, scorecard workflow, SQL/RPC definitions, artwork, player
screen names, and negative-score behavior.

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

## Safety boundary

The standalone Preview must use the existing RLS staging project
`krys-rls-staging` (`jiekoqgegqcbqaobisvm`) and must not receive Production
credentials. No Production database writes, deployments, historical edits, or
release promotion are part of this recovery.

Synthetic records and the extracted test suite are the verification path. The
Production database was inspected read-only only. As of the recovery audit,
Production Stroke season 63 has 45 scheduled fixtures but 23 stored results;
its final scorecard is still a draft. Therefore it is evidence of recovered
schema/workflow, not a completed Production season suitable for release.
