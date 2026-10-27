import test from "node:test"
import assert from "node:assert/strict"
import { summarizeWeeklyRows, validateWeeklyRows, weeklyFingerprint, type WeeklyEvidenceRow } from "./weeklyEvidence.ts"

const row = (overrides: Partial<WeeklyEvidenceRow> = {}): WeeklyEvidenceRow => ({
  source: "THE_WEEKLY",
  eventId: "S20W06",
  seasonWeek: "S20W06",
  division: "AMATEUR",
  playerExact: "Player One",
  courseCode: "BHE",
  difficulty: "EASY",
  score: -17,
  completedRound: true,
  sourceScreenshot: "weekly_screenshots/S20W06/image.png",
  sourceRow: 1,
  verificationStatus: "VERIFIED",
  ...overrides,
})

test("Weekly rows are rating-only and never personal handicap eligible", () => {
  const result = validateWeeklyRows([row()])
  assert.equal(result.accepted[0]?.courseRatingEligible, true)
  assert.equal(result.accepted[0]?.personalHandicapEligible, false)
})

test("source-specific fingerprints reject repeated delivery but preserve different events", () => {
  const first = row()
  const result = validateWeeklyRows([first, first, row({ eventId: "S20W07", seasonWeek: "S20W07" })])
  assert.equal(result.accepted.length, 2)
  assert.equal(result.rejected[0]?.reason, "DUPLICATE_WEEKLY_SOURCE_FINGERPRINT")
  assert.equal(weeklyFingerprint(first), "THE_WEEKLY|S20W06|AMATEUR|Player One|BHE|1")
})

test("missing, incomplete, ambiguous, and penalty-only rows are rejected", () => {
  const result = validateWeeklyRows([
    row({ score: null }),
    row({ sourceRow: 2, completedRound: false }),
    row({ sourceRow: 3, verificationStatus: "AMBIGUOUS", exceptionReason: "NAME_UNREADABLE" }),
    row({ sourceRow: 4, verificationStatus: "EXCLUDED", exceptionReason: "REPLACED_ELITE_CAPTURE" }),
  ])
  assert.equal(result.accepted.length, 0)
  assert.equal(result.rejected.length, 4)
})

test("summaries retain repeated course appearances as independent events", () => {
  const result = validateWeeklyRows([
    row(),
    row({ eventId: "S20W07", seasonWeek: "S20W07", sourceRow: 2 }),
  ])
  const summary = summarizeWeeklyRows(result.accepted)
  assert.deepEqual(summary, [{ courseCode: "BHE", difficulty: "EASY", eventCount: 2, rowCount: 2, distinctSourcePlayers: 1 }])
})
