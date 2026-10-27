import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import crypto from "node:crypto"
import Papa from "papaparse"

const root = process.cwd()
const dir = path.join(root, "docs", "handicap", "phase134")
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"))
const readCsv = (name) => Papa.parse(fs.readFileSync(path.join(dir, name), "utf8"), { header: true, skipEmptyLines: true }).data

test("Phase 134 preserves the verified owner batch and fails closed on missing lineage", () => {
  const checksums = readJson("checksums.json")
  assert.equal(checksums.phase130_batch_sha256, "52D2D88FD821F231148FCCC1C90C85BF32D34FA9156C2A8C2F3D75CD2CF53C0B")
  assert.equal(checksums.counts.pending_ratings, 73)
  assert.equal(checksums.counts.pending_exact_production_ratings, 58)
  assert.equal(checksums.counts.pending_blocked_ratings, 15)
  assert.equal(checksums.counts.owner_exact_production_ratings, 3)
  assert.equal(checksums.counts.owner_blocked_value_mismatches, 2)
  assert.equal(checksums.counts.owner_approved_ratings, 5)
})

test("owner-approved value mismatches are blocked rather than silently remapped", () => {
  const rows = readCsv("rating_snapshot_reconciliation.csv")
  const five = rows.filter((row) => row.batch_scope === "PRIOR_OWNER_APPROVAL_5")
  assert.equal(five.length, 5)
  assert.equal(five.filter((row) => row.status === "EXACT_EXISTING_PRODUCTION").length, 3)
  assert.equal(five.filter((row) => row.status === "BLOCKED_PRODUCTION_VALUE_MISMATCH").length, 2)
  assert.equal(five.find((row) => row.course_id === "Forgotten Fairyland_easy").production_rating, "-28.75")
  assert.equal(five.find((row) => row.course_id === "Shangri-La_easy").production_rating, "-30.067")
})

test("index review preserves Weekly exclusion and records blocked rating dependencies", () => {
  const rows = readCsv("index_dependency_reconciliation.csv")
  assert.equal(rows.length, 166)
  assert.ok(rows.every((row) => row.weekly_rows_used === "0"))
  assert.ok(rows.some((row) => row.index_reconciliation_status === "BLOCKED_RATING_DEPENDENCY"))
  assert.ok(rows.every((row) => JSON.parse(row.missing_or_mismatched_local_rating_snapshot_ids).every(Boolean)))
})

test("blocked installation is append-only and cannot partially insert", () => {
  const sql = fs.readFileSync(path.join(dir, "production_rating_decision_installation.sql"), "utf8")
  assert.match(sql, /RAISE EXCEPTION 'Phase134 blocked/)
  assert.doesNotMatch(sql, /\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b/i)
  assert.match(sql, /BEGIN;/)
  assert.match(sql, /COMMIT;/)
})

test("generated artifact checksums are deterministic and present", () => {
  const checksums = readJson("checksums.json")
  for (const [name, expected] of Object.entries(checksums.generated_files)) {
    const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, name))).digest("hex").toUpperCase()
    assert.equal(actual, expected, name)
  }
})
