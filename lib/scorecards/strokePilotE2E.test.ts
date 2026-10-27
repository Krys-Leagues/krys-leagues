import assert from "node:assert/strict"
import test from "node:test"

import { strokeScorecardAdapter } from "./adapters/stroke.ts"
import { calculateScorecardTotals } from "./core.ts"
import { completeMockStrokePilot, strokeGameState, type StrokeDivisionBoard } from "./strokePilot.ts"

test("local mock covers received evidence through adapter commit and same-board completion", () => {
  const sourceKey = "00000000-0000-4000-8000-000000000010"
  const players = [
    { roleKey: "player1", playerId: "00000000-0000-4000-8000-000000000001", teamId: null, displayName: "WILMA_FINGERDOO" },
    { roleKey: "player2", playerId: "00000000-0000-4000-8000-000000000002", teamId: null, displayName: "PRINCESS_BANKSHOT" },
  ]
  const pars = Array.from({ length: 18 }, () => 4)
  const firstHoles = pars.map((par, index) => ({ holeNumber: index + 1, par, strokes: index < 9 ? 3 : 4 }))
  const secondHoles = pars.map((par, index) => ({ holeNumber: index + 1, par, strokes: index < 6 ? 3 : 4 }))
  const board: StrokeDivisionBoard = {
    seasonId: "00000000-0000-4000-8000-000000000063", seasonNumber: 63,
    rosterVersionId: "00000000-0000-4000-8000-000000000099", division: 1,
    games: [{ sourceKey, gameNumber: 1, playerOne: players[0].displayName, playerTwo: players[1].displayName, course: "Tourist Trap Easy", state: "NOT PLAYED", playerOneScore: null, playerTwoScore: null }],
    standings: [],
  }
  const received = { ...board, games: board.games.map((game) => ({ ...game, state: strokeGameState({ completed: false, hasActiveEvidence: true }) })) }
  assert.equal(received.games[0].state, "SCORECARD RECEIVED")
  const cards = [
    { participant: players[0], holes: firstHoles, totals: calculateScorecardTotals(firstHoles, pars) },
    { participant: players[1], holes: secondHoles, totals: calculateScorecardTotals(secondHoles, pars) },
  ]
  const plan = strokeScorecardAdapter.buildCommitPlan({ adapterKey: "stroke", sourceType: "fixture", sourceKey, seasonId: board.seasonId, seasonNumber: 63, divisionNumber: 1, divisionLabel: "Stroke D1", gameNumber: 1, roundKey: null, roundLabel: null, arrangedPlayedDate: null, eventPlayedDate: null, courseId: "00000000-0000-4000-8000-000000000020", courseCode: "TTE", courseName: "Tourist Trap Easy", difficulty: "Easy", pars, participants: players }, cards)
  assert.equal(plan.resultPayload.rpc, "save_stroke_result")
  assert.equal(plan.standingsRefresh?.rpc, "rebuild_stroke_standings")
  const completed = completeMockStrokePilot({ board: received, sourceKey, playerOneScore: cards[0].totals.scoreToPar, playerTwoScore: cards[1].totals.scoreToPar, standings: [{ rank: 1, player: players[0].displayName, gp: 1, wins: 1, losses: 0, ties: 0, strokes: cards[0].totals.scoreToPar, points: 2 }, { rank: 2, player: players[1].displayName, gp: 1, wins: 0, losses: 1, ties: 0, strokes: cards[1].totals.scoreToPar, points: 0 }] })
  assert.equal(completed.games[0].sourceKey, sourceKey)
  assert.equal(completed.games[0].state, "COMPLETED")
  assert.equal(completed.games[0].playerOneScore, -9)
  assert.equal(completed.standings[0].gp, 1)
  assert.deepEqual(Object.keys(completed.standings[0]).slice(2), ["gp", "wins", "losses", "ties", "strokes", "points"])
})
