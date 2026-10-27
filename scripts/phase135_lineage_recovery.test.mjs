import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import Papa from "papaparse"

const dir = path.join(process.cwd(), "docs", "handicap", "phase135")
const json = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"))
const csv = (name) => Papa.parse(fs.readFileSync(path.join(dir, name), "utf8"), { header: true, skipEmptyLines: true }).data

test("Phase135 recovers verified successor ratings and quarantines mismatches", () => {
  const checksums = json("checksums.json")
  assert.equal(checksums.owner_batch_sha256, "52D2D88FD821F231148FCCC1C90C85BF32D34FA9156C2A8C2F3D75CD2CF53C0B")
  assert.equal(checksums.counts.blocked_input_ratings, 17)
  assert.equal(checksums.counts.successor_snapshots, 16)
  assert.equal(checksums.counts.lineage_exceptions, 1)
  const rows = csv("successor_rating_snapshots.csv")
  assert.equal(rows.length, 16)
  assert.equal(new Set(rows.map((row) => row.successor_snapshot_id)).size, 16)
  assert.ok(rows.every((row) => row.review_scope === "KWT_ONLY" && row.publication_status === "UNPUBLISHED" && row.source_ref_count === String(row.sample_size)))
  assert.ok(rows.every((row) => JSON.parse(row.source_evidence_refs).length === Number(row.sample_size)))
})

test("all recovered source rows are KWT and player-count complete", () => {
  const rows = csv("successor_rating_snapshots.csv")
  assert.ok(rows.every((row) => row.lineage_status === "VERIFIED_EXISTING_KWT_PROVENANCE"))
  assert.ok(rows.every((row) => Number(row.distinct_canonical_player_count) > 0))
  assert.equal(rows.find((row) => row.course_id === "Venice_easy"), undefined)
  assert.equal(rows.find((row) => row.course_id === "Forgotten Fairyland_easy")?.source_ref_count, "100")
  assert.equal(rows.find((row) => row.course_id === "Shangri-La_easy")?.source_ref_count, "171")
})

test("complete mapping revalidates all indexes without Weekly inputs", () => {
  const checksums = json("checksums.json")
  const rows = csv("player_index_revalidation.csv")
  assert.equal(rows.length, 166)
  assert.equal(checksums.counts.complete_rating_mappings, 77)
  assert.equal(checksums.counts.blocked_index_candidates, 28)
  assert.equal(rows.filter((row) => row.validation_status === "BLOCKED_MISSING_RATING_LINEAGE").length, 28)
  assert.equal(rows.filter((row) => row.validation_status === "REVALIDATED" && row.dependency_mapping_changed !== "UNCHANGED_PRODUCTION_ID").length, 138)
  assert.equal(rows.filter((row) => row.validation_status === "REVALIDATED" && row.handicap_status === "OFFICIAL_ELIGIBLE").length, 98)
  assert.equal(rows.filter((row) => row.validation_status === "REVALIDATED" && row.handicap_status === "PROVISIONAL").length, 40)
  assert.ok(rows.every((row) => row.weekly_rows_used === "0" && row.calculation_value_changed === "NO" && row.publication_status === "UNPUBLISHED"))
})

test("Venice Easy source-count mismatch remains explicitly quarantined", () => {
  const rows = csv("lineage_exceptions.csv")
  assert.deepEqual(rows, [{
    local_snapshot_id: "96bdf7e8-1b97-51c8-83c7-3a03c3413f4e",
    course_id: "Venice_easy",
    difficulty: "easy",
    candidate_sample_size: "215",
    recovered_source_ref_count: "217",
    candidate_distinct_players: "101",
    recovered_distinct_players: "101",
    source_scope: "KWT_ONLY",
    status: "BLOCKED_LINEAGE_MISMATCH",
    reasons: "SOURCE_COUNT_MISMATCH:217:215",
  }])
})

test("installation remains append-only and quarantined", () => {
  const sql = fs.readFileSync(path.join(dir, "production_installation.sql"), "utf8")
  assert.match(sql, /publication_eligibility,?\s*\) VALUES/) 
  assert.match(sql, /'DRAFT'/)
  assert.match(sql, /'QUARANTINED'/)
  assert.match(sql, /'UNPUBLISHED'/)
  assert.doesNotMatch(sql, /\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b/i)
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+public\.handicap_(index_snapshots|review_decisions|source_provenance)\b/i)
})

test("generated checksums are internally consistent", () => {
  const checksums = json("checksums.json")
  for (const [name, expected] of Object.entries(checksums.generated_files)) {
    const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, name))).digest("hex").toUpperCase()
    assert.equal(actual, expected, name)
  }
})
