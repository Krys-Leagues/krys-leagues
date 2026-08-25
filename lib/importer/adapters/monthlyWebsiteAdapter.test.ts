import test from "node:test"
import assert from "node:assert/strict"
import { classifyMonthlyPeriod, previewMonthlyWebsiteCsvRows, previewMonthlyWebsiteViews } from "./monthlyWebsiteAdapter.ts"

const view = {
  period: "2026 August",
  division: "Master",
  periodId: 461,
  sourceUrl: "https://example.test/monthly/home",
  leaders: [{ placement: 1, historicalPlayerName: "Exact Name", sourcePlayerId: "42", coursesPlayed: 2, totalStrokes: -31, overallHn1: 5, overallPoints: 410 }],
  courses: [
    { course: "Cherry Blossom", difficulty: "easy" as const, rows: [{ placement: 1, historicalPlayerName: "Exact Name", sourcePlayerId: "42", score: -17, holeInOnes: 3, points: 205 }] },
    { course: "Cherry Blossom", difficulty: "hard" as const, rows: [{ placement: 1, historicalPlayerName: "Exact Name", sourcePlayerId: "42", score: -14, holeInOnes: 2, points: 205 }] },
  ],
}

test("Monthly adapter preserves negative scores and validates totals", () => {
  const preview = previewMonthlyWebsiteViews([view])
  assert.equal(preview.summary.scoreRows, 2)
  assert.equal(preview.summary.negativeScores, 2)
  assert.equal(preview.summary.totalMismatches, 0)
  assert.equal(preview.rows[0].historicalPlayerName, "Exact Name")
  assert.equal(preview.rows[0].totalStrokes, -31)
})

test("Monthly adapter blocks missing score cells without inventing values", () => {
  const preview = previewMonthlyWebsiteViews([{ ...view, courses: [{ ...view.courses[0], rows: [{ ...view.courses[0].rows[0], score: null }] }] }])
  assert.equal(preview.summary.scoreRows, 0)
  assert.equal(preview.summary.missingScoreRows, 1)
  assert.equal(preview.rows[0].score, null)
  assert.deepEqual(preview.rows[0].issues, ["Score is missing from the authoritative rendered row."])
})

test("Monthly adapter detects conflicting observations for the same course row", () => {
  const preview = previewMonthlyWebsiteViews([view, { ...view, courses: [{ ...view.courses[0], rows: [{ ...view.courses[0].rows[0], score: -18 }] }] }])
  assert.equal(preview.summary.conflictingRows, 1)
})

test("Monthly CSV adapter preserves the recovered source counts and blocks blank scores", () => {
  const preview = previewMonthlyWebsiteCsvRows([
    { source_row: "1", period: "2026 August", year: "2026", month: "8", period_id: "461", division: "Master", historical_player_name: "Exact Name", source_player_id: "42", course_name: "Cherry Blossom", difficulty: "easy", score: "-17", hole_in_ones: "3", course_placement: "1", course_points: "205", overall_placement: "1", courses_played: "2", total_strokes: "-31", overall_hole_in_ones: "5", overall_points: "410", source_url: "https://example.test/monthly" },
    { source_row: "2", period: "2026 August", year: "2026", month: "8", period_id: "461", division: "Master", historical_player_name: "Exact Name", source_player_id: "42", course_name: "Cherry Blossom", difficulty: "hard", score: "", hole_in_ones: "", course_placement: "", course_points: "", overall_placement: "1", courses_played: "2", total_strokes: "-31", overall_hole_in_ones: "5", overall_points: "410", source_url: "https://example.test/monthly" },
  ])
  assert.equal(preview.summary.totalRows, 2)
  assert.equal(preview.summary.scoreRows, 1)
  assert.equal(preview.summary.missingScoreRows, 1)
  assert.equal(preview.summary.negativeScores, 1)
  assert.equal(preview.summary.totalMismatches, 0)
})

test("Monthly adapter blocks the active period using a finalization cutoff", () => {
  const preview = previewMonthlyWebsiteCsvRows([
    { source_row: "1", period: "2026 July", year: "2026", month: "7", period_id: "441", division: "Elite", historical_player_name: "Finished", source_player_id: "1", course_name: "Course", difficulty: "easy", score: "-10", source_url: "https://example.test/monthly" },
    { source_row: "2", period: "2026 August", year: "2026", month: "8", period_id: "461", division: "Elite", historical_player_name: "Current", source_player_id: "2", course_name: "Course", difficulty: "easy", score: "-11", source_url: "https://example.test/monthly" },
    { source_row: "3", period: "2027 January", year: "2027", month: "1", period_id: "500", division: "Elite", historical_player_name: "Future", source_player_id: "3", course_name: "Course", difficulty: "easy", score: "-12", source_url: "https://example.test/monthly" },
  ], { finalizedThrough: "2026 July" })
  assert.equal(preview.rows[0].importable, true)
  assert.equal(preview.rows[1].periodStatus, "current_incomplete")
  assert.equal(preview.rows[1].importable, false)
  assert.match(preview.rows[1].periodBlockReason ?? "", /CURRENT \/ INCOMPLETE \/ NOT IMPORTABLE/)
  assert.equal(preview.rows[2].importable, false)
  assert.equal(preview.summary.completedScoreRows, 1)
  assert.equal(preview.summary.currentIncompleteScoreRows, 2)
})

test("Monthly period classification does not depend on a hard-coded month", () => {
  assert.equal(classifyMonthlyPeriod(2026, 9, "2026 August").importable, false)
  assert.equal(classifyMonthlyPeriod(2026, 9, "2026 September").importable, true)
})
