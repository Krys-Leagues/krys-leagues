import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import Papa from "papaparse"

const root = process.cwd()
const outputDir = path.join(root, "docs", "handicap", "phase118")

function csvRows(fileName: string): Array<Record<string, string>> {
  const result = Papa.parse<Record<string, string>>(fs.readFileSync(path.join(outputDir, fileName), "utf8"), {
    header: true,
    skipEmptyLines: true,
  })
  assert.equal(result.errors.length, 0)
  return result.data
}

function sha256(fileName: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(outputDir, fileName))).digest("hex").toUpperCase()
}

test("Phase 118 package is local-only and preserves the verified evidence counts", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, "phase118_package_manifest.json"), "utf8"))
  assert.equal(manifest.status, "LOCAL_ONLY_DRAFT_QUARANTINED_NOT_FOR_PUBLICATION")
  assert.deepEqual(manifest.counts, {
    historicalKwtRows: 13550,
    newKwtRows: 728,
    combinedKwtRows: 14276,
    weeklyRows: 844,
    completePairs: 7138,
    incompletePairs: 2,
    oldIndexCandidates: 157,
    revisedIndexCandidates: 166,
    blockedPlayers: 0,
    readyCourseCandidates: 78,
    provisionalCourseCandidates: 2,
    blockedOrUnratedCourseCandidates: 1,
    largeIndexMovements: 33,
  })
  assert.equal(manifest.modelVersion, "krys-handicap-candidate-a-v1")
  assert.equal(manifest.referenceSlope, 8.515)
})

test("Phase 118 keeps Weekly evidence out of every personal-index comparison row", () => {
  const rows = csvRows("phase118_player_index_comparison.csv")
  const canonicalNames = JSON.parse(fs.readFileSync(path.join(outputDir, "canonical_player_names.json"), "utf8")) as Record<string, string>
  assert.equal(rows.length, 166)
  assert.equal(Object.keys(canonicalNames).length, 157)
  assert.ok(rows.filter((row) => canonicalNames[row.canonical_player_id]).every((row) => row.canonical_screen_name === canonicalNames[row.canonical_player_id]))
  assert.ok(rows.every((row) => row.weekly_rows_used === "0"))
  assert.ok(rows.every((row) => row.chronology_confidence === "OFFICIAL_KWT_SEQUENCE"))
  assert.ok(rows.every((row) => row.status === "LOCAL_PREVIEW_ONLY"))
})

test("Phase 118 preserves signed values and golf-style display notation", () => {
  const rows = csvRows("phase118_player_index_comparison.csv")
  const positive = rows.find((row) => row.revised_local_index === "9.224")
  const negative = rows.find((row) => row.revised_local_index === "-2.38")
  assert.equal(positive?.revised_golf_display, "9.22")
  assert.equal(negative?.revised_golf_display, "+2.38")
  assert.ok(rows.every((row) => row.revised_local_index === "" || /^\+?\d+\.\d{2}$/.test(row.revised_golf_display)))
})

test("Phase 118 emits all source-separated course models and verifies output hashes", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, "phase118_package_manifest.json"), "utf8"))
  const rows = csvRows("phase118_course_rating_comparison.csv")
  assert.equal(rows.length, 324)
  assert.deepEqual(new Set(rows.map((row) => row.model)), new Set(["KWT_ONLY", "KWT_PLUS_S14_W05_12", "WEEKLY_ONLY", "KWT_PLUS_WEEKLY"]))
  assert.ok(rows.filter((row) => row.model.includes("WEEKLY")).every((row) => row.weekly_rows_in_model !== undefined))
  assert.equal(manifest.outputChecksums.courseComparison, sha256("phase118_course_rating_comparison.csv"))
  assert.equal(manifest.outputChecksums.playerComparison, sha256("phase118_player_index_comparison.csv"))
  assert.equal(manifest.outputChecksums.exceptions, sha256("phase118_exception_summary.csv"))
  assert.equal(manifest.outputChecksums.report, sha256("phase118_review_report.md"))
})
