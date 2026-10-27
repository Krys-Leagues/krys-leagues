import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

function csvRows(fileName: string): Record<string, string>[] {
  const lines = fs.readFileSync(path.join(process.cwd(), fileName), "utf8").trim().split(/\r?\n/)
  const header = lines.shift()!.split(",")
  return lines.filter(Boolean).map((line) => {
    const cells = line.split(",")
    return Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ""]))
  })
}

test("Phase 54 Weekly evidence remains course-rating-only and deduplicated", () => {
  const rows = csvRows("weekly_course_evidence.csv")
  assert.equal(rows.length, 844)
  assert.ok(rows.every((row) => row.source === "THE_WEEKLY"))
  assert.ok(rows.every((row) => row.personal_handicap_eligible === "false"))
  assert.equal(new Set(rows.map((row) => [row.event_id, row.division, row.player_exact, row.course_code, row.source_row].join("|"))).size, rows.length)
  assert.equal(rows.filter((row) => row.event_id === "S19W10_LBE_RCH").length, 158)
  assert.equal(new Set(rows.filter((row) => row.event_id === "S19W10_LBE_RCH").map((row) => row.player_exact)).size, 79)
  assert.equal(rows.filter((row) => row.event_id === "S21W05_GLE_HWH").length, 184)
  assert.equal(new Set(rows.filter((row) => row.event_id === "S21W05_GLE_HWH").map((row) => row.player_exact)).size, 92)
  assert.equal(rows.filter((row) => row.event_id === "S20W05_MGE_ZZH").length, 172)
  assert.equal(new Set(rows.filter((row) => row.event_id === "S20W05_MGE_ZZH").map((row) => row.player_exact)).size, 86)
  assert.equal(rows.filter((row) => row.event_id === "S20W06_BHE_QVH").length, 170)
  assert.equal(new Set(rows.filter((row) => row.event_id === "S20W06_BHE_QVH").map((row) => row.player_exact)).size, 85)
  assert.equal(rows.filter((row) => row.event_id === "S20W07_ALE_BHH").length, 160)
  assert.equal(new Set(rows.filter((row) => row.event_id === "S20W07_ALE_BHH").map((row) => row.player_exact)).size, 80)
})

test("every manifest screenshot has one explicit Phase 54 classification", () => {
  const rows = csvRows("weekly_manifest_status.csv")
  assert.equal(rows.length, 56)
  assert.equal(new Set(rows.map((row) => `${row.event_id}|${row.source_path}`)).size, 56)
  assert.ok(rows.every((row) => ["VERIFIED", "PARTIALLY_PROCESSED", "UNREADABLE", "SUPERSEDED", "QUARANTINED"].includes(row.classification)))
})
