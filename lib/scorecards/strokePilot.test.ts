import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { calculateScorecardTotals, resolvePlayedDate } from "./core.ts"
import { canSubmitStrokeScorecard, completeMockStrokePilot, occupiedStrokeDivisions, strokeGameState, type StrokeDivisionBoard } from "./strokePilot.ts"

const initial: StrokeDivisionBoard = {
  seasonId: "11111111-1111-4111-8111-111111111111",
  seasonNumber: 63,
  rosterVersionId: "22222222-2222-4222-8222-222222222222",
  division: 1,
  games: [{ sourceKey: "33333333-3333-4333-8333-333333333333", gameNumber: 1, playerOne: "WILMA_FINGERDOO", playerTwo: "PRINCESS_BANKSHOT", course: "Tourist Trap Easy", state: "NOT PLAYED", playerOneScore: null, playerTwoScore: null }],
  standings: [{ rank: 1, player: "WILMA_FINGERDOO", gp: 0, wins: 0, losses: 0, ties: 0, strokes: 0, points: 0 }],
}

test("occupied approved roster slots alone determine active Stroke divisions", () => {
  assert.deepEqual(occupiedStrokeDivisions([{ division_number: 4 }, { division_number: 1 }, { division_number: 2 }, { division_number: 3 }, { division_number: 1 }]), [1, 2, 3, 4])
  assert.equal(occupiedStrokeDivisions([{ division_number: 1 }, { division_number: 4 }]).includes(5), false)
})

test("game state advances only from durable evidence or an authoritative result", () => {
  assert.equal(strokeGameState({ completed: false, hasActiveEvidence: false }), "NOT PLAYED")
  assert.equal(strokeGameState({ completed: false, hasActiveEvidence: true }), "SCORECARD RECEIVED")
  assert.equal(strokeGameState({ completed: true, hasActiveEvidence: true }), "COMPLETED")
  assert.equal(canSubmitStrokeScorecard(initial.games[0]), true)
})

test("local end-to-end pilot updates the same fixture and full standings model", () => {
  const completed = completeMockStrokePilot({ board: initial, sourceKey: initial.games[0].sourceKey, playerOneScore: -9, playerTwoScore: -6, standings: [{ rank: 1, player: "WILMA_FINGERDOO", gp: 1, wins: 1, losses: 0, ties: 0, strokes: -9, points: 2 }, { rank: 2, player: "PRINCESS_BANKSHOT", gp: 1, wins: 0, losses: 1, ties: 0, strokes: -6, points: 0 }] })
  assert.equal(completed.games.length, 1)
  assert.equal(completed.games[0].sourceKey, initial.games[0].sourceKey)
  assert.equal(completed.games[0].state, "COMPLETED")
  assert.deepEqual(Object.keys(completed.standings[0]), ["rank", "player", "gp", "wins", "losses", "ties", "strokes", "points"])
})

test("negative golf score-to-par remains valid and ambiguous raw dates are never parsed", () => {
  const pars = Array.from({ length: 18 }, () => 4)
  const holes = pars.map((par, index) => ({ holeNumber: index + 1, par, strokes: index < 9 ? 3 : 4 }))
  assert.equal(calculateScorecardTotals(holes, pars).scoreToPar, -9)
  assert.throws(() => resolvePlayedDate({ arrangedGameDate: null, eventRoundDate: null, adminSelectedDate: null, rawCardDateText: "09/10/26" }), /Played Date/)
  const selected = resolvePlayedDate({ arrangedGameDate: null, eventRoundDate: null, adminSelectedDate: "2026-09-10", rawCardDateText: "09/10/26" })
  assert.equal(selected.playedDate, "2026-09-10")
  assert.equal(selected.rawCardDateText, "09/10/26")
})

test("board coordinator and admin workspace preserve the required security and failure boundaries", async () => {
  const [server, route, admin, manage, migration] = await Promise.all([
    readFile("lib/scorecards/strokeBoardServer.ts", "utf8"),
    readFile("app/api/internal/scorecards/stroke/boards/route.ts", "utf8"),
    readFile("lib/scorecards/adminServer.ts", "utf8"),
    readFile("components/admin/scorecards/ManageStrokeSeasonClient.tsx", "utf8"),
    readFile("supabase/migrations/20260918183000_stroke_live_board_pilot.sql", "utf8"),
  ])
  assert.match(server, /stroke_roster_versions[\s\S]*eq\("status", "approved"\)/)
  assert.match(server, /occupiedStrokeDivisions\(slots\)/)
  assert.doesNotMatch(server, /is_active/)
  assert.match(route, /verifyScorecardBridgeRequest/)
  assert.match(route, /Board is not an occupied current Stroke division/)
  assert.match(admin, /boardSync[\s\S]*retry_required/)
  assert.match(manage, /GP[\s\S]*STROKES[\s\S]*PTS/)
  assert.match(manage, /MANUAL SCORING/)
  assert.match(migration, /force row level security/)
  assert.match(migration, /revoke all[\s\S]*anon, authenticated/)
  assert.doesNotMatch(migration, /grant select[^;]+authenticated/i)
})

