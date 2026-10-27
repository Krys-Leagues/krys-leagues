import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import Papa from "papaparse"

const root = process.cwd()
const dir = path.join(root, "docs", "handicap", "phase140")
const rows = Papa.parse(fs.readFileSync(path.join(dir, "index_snapshot_import_rows.csv"), "utf8"), { header: true, skipEmptyLines: true }).data
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "calculation_run_manifest.json"), "utf8"))
const installation = fs.readFileSync(path.join(dir, "production_installation.sql"), "utf8")
const anyUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const deterministicUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

test("Phase 140 package has the validated rolling-20 population", () => {
  assert.equal(rows.length, 166)
  assert.equal(rows.filter((row) => row.handicap_status === "OFFICIAL_ELIGIBLE").length, 120)
  assert.equal(rows.filter((row) => row.handicap_status === "PROVISIONAL").length, 46)
  assert.equal(new Set(rows.map((row) => row.id)).size, 166)
  assert.equal(new Set(rows.map((row) => row.canonical_player_id)).size, 166)
  assert.ok(rows.every((row) => deterministicUuid.test(row.id) && anyUuid.test(row.canonical_player_id)))
})

test("Phase 140 enforces KWT-only, sequence chronology, and unpublished state", () => {
  assert.ok(rows.every((row) => row.source_scope === "KWT_ONLY"))
  assert.ok(rows.every((row) => row.weekly_rows_used === "0"))
  assert.ok(rows.every((row) => row.chronology_confidence === "OFFICIAL_KWT_SEQUENCE"))
  assert.ok(rows.every((row) => row.publication_status === "UNPUBLISHED"))
  assert.ok(rows.every((row) => !row.source_round_ids.includes("THE_WEEKLY")))
  assert.ok(rows.every((row) => JSON.parse(row.latest_ten_source_round_ids).length === 0 && JSON.parse(row.best_five_source_round_ids).length === 0))
})

test("Phase 140 uses new immutable IDs and explicit quarantine metadata", () => {
  assert.equal(manifest.candidate_counts.total, 166)
  assert.equal(manifest.candidate_counts.official_eligible, 120)
  assert.equal(manifest.candidate_counts.provisional, 46)
  assert.equal(manifest.publication_opt_in, false)
  assert.equal(manifest.index_approval_required, true)
  assert.equal(manifest.effective_from, null)
  assert.equal(manifest.chronology_policy, "OFFICIAL_KWT_SEQUENCE")
  assert.equal(manifest.weekly_personal_inputs, 0)
  assert.ok(rows.every((row) => row.calculation_run_id === manifest.calculation_run_id))
  assert.ok(rows.every((row) => row.source_index_snapshot_id !== row.id))
  assert.match(installation, /publication_status = 'UNPUBLISHED'/)
  assert.match(installation, /publication_eligibility = 'QUARANTINED'/)
  assert.match(installation, /active_round_count = 20/)
  assert.doesNotMatch(installation, /\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b/i)
})
