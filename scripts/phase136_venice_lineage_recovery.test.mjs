import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import Papa from "papaparse"

const dir = path.join(process.cwd(), "docs", "handicap", "phase136")
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"))
const readCsv = (name) => Papa.parse(fs.readFileSync(path.join(dir, name), "utf8"), { header: true, skipEmptyLines: true }).data

test("Venice Easy reconciles 217 ledger rows to 215 complete official pairs", () => {
  const checksums = readJson("checksums.json")
  assert.equal(checksums.counts.venice_easy_ledger_rows, 217)
  assert.equal(checksums.counts.venice_easy_qualifying_rows, 215)
  assert.equal(checksums.counts.venice_easy_excluded_incomplete_pair_rows, 2)
  const rows = readCsv("venice_easy_lineage_comparison.csv")
  assert.deepEqual(rows.map((row) => row.source_fingerprint), ["KWT|KWT11W04|63|VNE|58095", "KWT|KWT4W07|3506|VNE|44429"])
  assert.ok(rows.every((row) => row.eligibility === "EXCLUDED_FROM_VENICE_RATING_INCOMPLETE_OFFICIAL_PAIR"))
  assert.ok(rows.every((row) => row.evidence_classification === "VERIFIED_KWT_PROVENANCE_PRESERVED"))
  assert.ok(rows.every((row) => row.duplicate_status === "UNIQUE_FINGERPRINT_AND_LOGICAL_OBSERVATION"))
})

test("successor package carries 17 ratings and complete 78-course mapping", () => {
  const checksums = readJson("checksums.json")
  assert.equal(checksums.counts.successor_snapshots, 17)
  assert.equal(checksums.counts.complete_rating_mappings, 78)
  const ratings = readCsv("successor_rating_snapshots.csv")
  const venice = ratings.find((row) => row.course_id === "Venice_easy")
  assert.equal(ratings.length, 17)
  assert.equal(venice.source_ref_count, "215")
  assert.equal(JSON.parse(venice.source_evidence_refs).length, 215)
  assert.equal(venice.publication_status, "UNPUBLISHED")
  assert.equal(venice.review_scope, "KWT_ONLY")
  assert.equal(venice.sample_size, "215")
  assert.equal(venice.distinct_canonical_player_count, "101")
})

test("all 166 index dependencies are revalidated without Weekly inputs", () => {
  const checksums = readJson("checksums.json")
  const rows = readCsv("player_index_revalidation.csv")
  assert.equal(rows.length, 166)
  assert.equal(checksums.counts.blocked_index_candidates, 0)
  assert.equal(rows.filter((row) => row.validation_status !== "REVALIDATED").length, 0)
  assert.equal(rows.filter((row) => row.handicap_status === "OFFICIAL_ELIGIBLE").length, 120)
  assert.equal(rows.filter((row) => row.handicap_status === "PROVISIONAL").length, 46)
  assert.ok(rows.every((row) => row.weekly_rows_used === "0" && row.calculation_value_changed === "NO" && row.publication_status === "UNPUBLISHED"))
})

test("installation is append-only, quarantined, and has no index/provenance writes", () => {
  const sql = fs.readFileSync(path.join(dir, "production_installation.sql"), "utf8")
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /'DRAFT'/)
  assert.match(sql, /'QUARANTINED'/)
  assert.match(sql, /'UNPUBLISHED'/)
  assert.doesNotMatch(sql, /\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b/i)
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+public\.handicap_(index_snapshots|review_decisions|source_provenance)\b/i)
  assert.match(sql, /Venice_easy/)
})

test("generated checksums are internally consistent", () => {
  const checksums = readJson("checksums.json")
  for (const [name, expected] of Object.entries(checksums.generated_files)) {
    const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, name))).digest("hex").toUpperCase()
    assert.equal(actual, expected, name)
  }
})
