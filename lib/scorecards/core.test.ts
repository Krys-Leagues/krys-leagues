import assert from "node:assert/strict"
import test from "node:test"

import {
  calculateScorecardTotals,
  isSupportedScorecardEvidence,
  resolvePlayedDate,
  validateScorecardHoles,
  type ScorecardHoleInput,
} from "./core.ts"
import { strokeScorecardAdapter } from "./adapters/stroke.ts"

const pars = [3, 4, 3, 4, 3, 3, 3, 4, 3, 5, 3, 4, 2, 3, 3, 3, 3, 7]
const holes: ScorecardHoleInput[] = pars.map((par, index) => ({
  holeNumber: index + 1,
  par,
  strokes: index < 9 ? Math.max(1, par - 1) : par,
}))

test("shared core requires exactly 18 ordered holes and authoritative pars", () => {
  assert.equal(validateScorecardHoles(holes, pars).length, 18)
  assert.throws(() => validateScorecardHoles(holes.slice(0, 17), pars), /exactly 18 holes/)
  assert.throws(() => validateScorecardHoles(holes.map((hole, index) => index === 3 ? { ...hole, par: 9 } : hole), pars), /authoritative par/)
})

test("raw strokes remain positive while a negative score-to-par is valid", () => {
  const totals = calculateScorecardTotals(holes, pars)
  assert.equal(totals.totalStrokes, totals.frontNineStrokes + totals.backNineStrokes)
  assert.ok(totals.scoreToPar < 0)
  assert.throws(() => calculateScorecardTotals(holes.map((hole, index) => index === 0 ? { ...hole, strokes: -2 } : hole), pars), /raw stroke/)
})

test("ambiguous raw card date text is never parsed as Played Date", () => {
  assert.throws(() => resolvePlayedDate({ rawCardDateText: "09/10/26" }), /Played Date/)
  assert.deepEqual(resolvePlayedDate({ arrangedGameDate: "2026-09-10", adminSelectedDate: "2026-09-11", rawCardDateText: "09/10/26" }), {
    playedDate: "2026-09-10",
    source: "arranged_game",
    rawCardDateText: "09/10/26",
  })
  assert.equal(resolvePlayedDate({ eventRoundDate: "2026-09-12", adminSelectedDate: "2026-09-13" }).source, "event_round")
  assert.equal(resolvePlayedDate({ adminSelectedDate: "2026-09-13" }).source, "admin_selected")
})

test("temporary evidence accepts only supported private image inputs", () => {
  assert.equal(isSupportedScorecardEvidence("image/png", 2_000_000), true)
  assert.equal(isSupportedScorecardEvidence("application/pdf", 2_000_000), false)
  assert.equal(isSupportedScorecardEvidence("image/jpeg", 11 * 1024 * 1024), false)
})

test("Stroke adapter preserves two-card totals and existing writer boundaries", () => {
  const participants = [
    { roleKey: "player1", playerId: "00000000-0000-4000-8000-000000000001", teamId: null, displayName: "WILMA_FINGERDOO" },
    { roleKey: "player2", playerId: "00000000-0000-4000-8000-000000000002", teamId: null, displayName: "PRINCESS_BANKSHOT" },
  ]
  const totals1 = calculateScorecardTotals(holes, pars)
  const secondHoles = holes.map((hole) => ({ ...hole, strokes: hole.strokes + 1 }))
  const totals2 = calculateScorecardTotals(secondHoles, pars)
  const plan = strokeScorecardAdapter.buildCommitPlan({
    adapterKey: "stroke",
    sourceType: "fixture",
    sourceKey: "00000000-0000-4000-8000-000000000010",
    seasonId: "00000000-0000-4000-8000-000000000063",
    seasonNumber: 63,
    divisionNumber: 1,
    divisionLabel: "Stroke D1",
    gameNumber: 1,
    roundKey: null,
    roundLabel: null,
    arrangedPlayedDate: null,
    eventPlayedDate: null,
    courseId: "00000000-0000-4000-8000-000000000020",
    courseCode: "TTE",
    courseName: "Tourist Trap Easy",
    difficulty: "Easy",
    pars: [...pars],
    participants,
  }, [
    { participant: participants[0], holes, totals: totals1 },
    { participant: participants[1], holes: secondHoles, totals: totals2 },
  ])
  assert.equal(plan.resultPayload.rpc, "save_stroke_result")
  assert.equal(plan.resultPayload.p_player1_score, totals1.scoreToPar)
  assert.equal(plan.resultPayload.p_player2_score, totals2.scoreToPar)
  assert.equal(plan.standingsRefresh?.rpc, "rebuild_stroke_standings")
})
