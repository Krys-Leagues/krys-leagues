import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { buildAceRecalculationReport } from "./aceRecalculation.ts"
import { getCourseChallenge } from "./catalog.ts"

const tourist = getCourseChallenge("tourist-trap")!
const cherry = getCourseChallenge("cherry-blossom")!

function card(id: string, courseSlug: string, holes: number[], challengeKey: "level" | "ace" = "level", status = "approved") {
  return { id, player_id: "player-1", course_slug: courseSlug, challenge_key: challengeKey, level_number: 1, ace_stage_number: 1, difficulty: "Easy", hole_scores: Array.from({ length: 18 }, (_, index) => holes.includes(index + 1) ? 1 : 3), status, requirements_evaluation: [], created_at: id }
}

function report(rows: ReturnType<typeof card>[], storedRows: Array<{ stage_number: number; completed_at: string | null }> = []) {
  return buildAceRecalculationReport({ rows, storedRows: storedRows.map((row) => ({ ...row, player_id: "player-1", course_slug: "tourist-trap" })), playerNames: new Map([["player-1", "Tricky"]]) })[0]
}

test("retroactive one-ace recovery uses a verified Level card", () => {
  const result = report([card("level-1", tourist.slug, [2, 3])])
  assert.deepEqual(result.newlyEarnedStages, [1])
  assert.equal(result.evidenceCards[0].challengeKey, "level")
})

test("retroactive recovery uses each stage's per-card thresholds", () => {
  const result = report([card("old-1", tourist.slug, [2, 5, 8]), card("old-2", tourist.slug, [2, 5, 8])])
  assert.deepEqual(result.newlyEarnedStages, [1])
})

test("retroactive recovery does not jump future stages from one card", () => {
  const result = report([card("nine-aces", tourist.slug, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])])
  assert.deepEqual(result.newlyEarnedStages, [1])
})

test("unverified cards and incomplete hole evidence are skipped without guessing", () => {
  const invalid = { ...card("missing", tourist.slug, [1]), hole_scores: null } as unknown as ReturnType<typeof card>
  const result = report([card("submitted", tourist.slug, [1], "level", "needs_review"), invalid])
  assert.equal(result.evidenceCards.length, 0)
  assert.deepEqual(result.skippedCards.map((item) => item.reason), ["not_verified", "missing_hole_scores"])
})

test("stored stages are compared to reconstructed stages without writing data", () => {
  const result = report([card("level-1", tourist.slug, [2, 5, 8])], [{ stage_number: 1, completed_at: "2026-09-01" }])
  assert.deepEqual(result.storedCompletedStages, [1])
  assert.deepEqual(result.newlyEarnedStages, [])
})

test("Tourist Trap and Cherry Blossom remain separate recalculation scopes", () => {
  const reports = buildAceRecalculationReport({
    rows: [card("tourist", tourist.slug, [2, 3]), card("cherry", cherry.slug, [10])],
    storedRows: [],
    playerNames: new Map([["player-1", "Tricky"]]),
  })
  assert.deepEqual(reports.map((item) => [item.courseSlug, item.newlyEarnedStages]), [["cherry-blossom", []], ["tourist-trap", [1]]])
})

test("the exposed recalculation path is an admin-only dry run with no writes", () => {
  const route = readFileSync(new URL("../../app/api/admin/course-challenges/ace-recalculation/route.ts", import.meta.url), "utf8")
  assert.match(route, /requireCourseChallengeAdmin/)
  assert.match(route, /dryRun: true/)
  assert.match(route, /writesPerformed: false/)
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(/)
})
