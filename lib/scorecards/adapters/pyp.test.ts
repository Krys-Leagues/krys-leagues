import assert from "node:assert/strict"
import test from "node:test"
import { calculateScorecardTotals, type ScorecardHoleInput } from "../core.ts"
import { pypScorecardAdapter } from "./pyp.ts"

const pars = Array(18).fill(4)
const context = { adapterKey: "pyp" as const, sourceType: "fixture" as const, sourceKey: "fixture-pyp-1", seasonId: "season-pyp-1", seasonNumber: 20, divisionNumber: 1, divisionLabel: "PYP D1", gameNumber: 1, roundKey: null, roundLabel: null, arrangedPlayedDate: null, eventPlayedDate: null, courseId: "course-1", courseCode: "PYP", courseName: "COURSE 1", difficulty: "Easy" as const, pars, pypComponents: { course1: { key: "course1" as const, courseName: "COURSE 1", difficulty: "Easy" as const, pars }, course2: { key: "course2" as const, courseName: "COURSE 2", difficulty: "Hard" as const, pars } }, participants: [{ roleKey: "home", playerId: "home", teamId: null, displayName: "HOME" }, { roleKey: "away", playerId: "away", teamId: null, displayName: "AWAY" }] }
const holes = (scores: number[]): ScorecardHoleInput[] => scores.map((strokes, index) => ({ holeNumber: index + 1, par: 4, strokes }))
const card = (roleKey: "home" | "away", componentKey: "course1" | "course2", scores: number[]) => { const values = holes(scores); return { componentKey, participant: context.participants.find((item) => item.roleKey === roleKey)!, holes: values, totals: calculateScorecardTotals(values, pars) } }

test("PYP requires Home and Away cards for both course components", () => {
  assert.throws(() => pypScorecardAdapter.validateForVerification([card("home", "course1", Array(18).fill(4))]), /exactly one Home/i)
  assert.doesNotThrow(() => pypScorecardAdapter.validateForVerification([card("home", "course1", Array(18).fill(4)), card("away", "course1", Array(18).fill(4)), card("home", "course2", Array(18).fill(4)), card("away", "course2", Array(18).fill(4))]))
})
test("PYP preserves two-course holes-won semantics and existing result writer", () => {
  const plan = pypScorecardAdapter.buildCommitPlan(context, [card("home", "course1", [3, ...Array(17).fill(4)]), card("away", "course1", [4, ...Array(17).fill(4)]), card("home", "course2", [4, 3, ...Array(16).fill(4)]), card("away", "course2", [3, 4, ...Array(16).fill(4)])])
  assert.equal(plan.resultPayload.rpc, "save_pyp_result"); assert.equal(plan.resultPayload.p_course1_home_hw, 1); assert.equal(plan.resultPayload.p_course2_home_hw, 1); assert.deepEqual(plan.standingsRefresh, { rpc: "rebuild_pyp_standings", p_season_id: "season-pyp-1", p_division_number: 1 })
})
test("PYP ties award neither player and negative golf values remain unrelated to HW", () => {
  const plan = pypScorecardAdapter.buildCommitPlan(context, [card("home", "course1", [5, ...Array(17).fill(4)]), card("away", "course1", [5, ...Array(17).fill(4)]), card("home", "course2", Array(18).fill(4)), card("away", "course2", Array(18).fill(4))])
  assert.equal(plan.resultPayload.p_course1_home_hw, 0); assert.equal(plan.resultPayload.p_course1_away_hw, 0); assert.equal(calculateScorecardTotals(holes(Array(18).fill(2)), pars).scoreToPar, -36)
})
