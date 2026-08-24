import test from "node:test"
import assert from "node:assert/strict"
import { MONTHLY_HISTORY_POLICY, parseMonthlyHistoryTables } from "./monthlyHistory.ts"

test("Monthly history preserves missing source facts as null", () => {
  const [row] = parseMonthlyHistoryTables("2026 August", [{
    heading: "Shangri-La", columns: ["#", "Player", "Score", "HN1", "Points"],
    rows: [[null, "INDY", null, null, null]],
  }])
  assert.equal(row.playerName, "INDY")
  assert.equal(row.position, null)
  assert.equal(row.score, null)
  assert.equal(row.holesInOne, null)
  assert.equal(row.points, null)
  assert.equal(row.resultLevel, "course")
  assert.equal(row.course, "Shangri-La")
})

test("Monthly history preserves authoritative overall division rows separately", () => {
  const [row] = parseMonthlyHistoryTables("2025 July", [{
    heading: "Master Leaders", columns: ["Pos", "Player", "Courses Played", "Total Strokes", "HN1's", "Points"],
    rows: [["1", "POLANECE", "8", "-174", "21", "1,471"]],
  }])
  assert.equal(row.resultLevel, "overall_division")
  assert.equal(row.division, "Master")
  assert.equal(row.course, null)
  assert.equal(row.coursesPlayed, 8)
  assert.equal(row.totalStrokes, -174)
  assert.equal(row.points, 1471)
  assert.equal(row.score, null)
})

test("same player and course across months remain independent historical facts", () => {
  const table = [{ heading: "Tourist Trap", division: "Master", columns: ["#", "Player", "Score", "HN1", "Points"], rows: [["2", "Krys", "-25", "3", "190"]] }]
  const july = parseMonthlyHistoryTables("2025 July", table)[0]
  const january = parseMonthlyHistoryTables("2025 January", table)[0]
  assert.equal(july.resultLevel, "course")
  assert.notEqual(july.sourceFingerprint, january.sourceFingerprint)
})

test("cross-division Overall Leaders is ignored", () => {
  const rows = parseMonthlyHistoryTables("2025 July", [{ heading: "Overall Leaders - 2025 July", columns: ["Pos", "Player", "League", "Courses Played", "Total Strokes", "HN1's", "Points"], rows: [["1", "Krys", "Master", "8", "-170", "10", "1400"]] }])
  assert.deepEqual(rows, [])
})

test("Monthly history creates stable provenance fingerprints without inventing facts", () => {
  const table = [{ heading: "Cherry Blossom", columns: ["#", "Player", "Score", "HN1", "Points"], rows: [["1", "mini_G", "-30", "5", "205"]] }]
  const first = parseMonthlyHistoryTables("2026 August", table)[0]
  const second = parseMonthlyHistoryTables("2026 August", table)[0]
  assert.deepEqual(first, second)
  assert.equal(first.score, -30)
  assert.ok(first.sourceFingerprint.includes("mini_G"))
})

test("Historical Monthly policy is read-only discovery and zero Climbers", () => {
  assert.equal(MONTHLY_HISTORY_POLICY.readOnly, true)
  assert.equal(MONTHLY_HISTORY_POLICY.historicalClimbersPoints, 0)
  assert.equal(MONTHLY_HISTORY_POLICY.unresolvedNamesBlockApply, true)
  assert.equal(MONTHLY_HISTORY_POLICY.archivedAndMemorialPlayersAreValidTargets, true)
})
