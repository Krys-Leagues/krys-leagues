import assert from "node:assert/strict"
import test from "node:test"

import { parsePlayerScorecardHistory, scorecardHistoryPath } from "./playerHistory.ts"

const entry = {
  league: "stroke", season_number: 63, competition: null, division: "Stroke D1", game_number: 2, round: null,
  course_code: "tourist-trap", course: "Tourist Trap", difficulty: "Easy" as const, played_date: "2026-09-18",
  submitted_at: "2026-09-18T12:00:00Z", verified_at: "2026-09-18T13:00:00Z", total_strokes: 50,
  score_to_par: -4, result: { outcome: "win" },
  holes: Array.from({ length: 18 }, (_, index) => ({ hole_number: index + 1, par: 3, strokes: index === 0 ? 1 : 3, score_to_par: index === 0 ? -2 : 0 })),
}

test("player history preserves all holes and negative score-to-par", () => {
  const parsed = parsePlayerScorecardHistory([entry])
  assert.equal(parsed[0].holes.length, 18)
  assert.equal(parsed[0].score_to_par, -4)
  assert.equal(parsed[0].holes[0].strokes, 1)
})

test("player history rejects partial cards", () => {
  assert.throws(() => parsePlayerScorecardHistory([{ ...entry, holes: entry.holes.slice(0, 17) }]), /incomplete/)
})

test("history path supports league to season to game to course navigation", () => {
  assert.equal(scorecardHistoryPath(entry), "stroke → Season 63 → Game 2 → Tourist Trap Easy")
})
