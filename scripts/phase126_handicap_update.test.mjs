import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import Papa from "papaparse"

const dir = "docs/handicap/phase126"
const candidates = Papa.parse(fs.readFileSync(`${dir}/player_index_candidates.csv`, "utf8"), { header: true, skipEmptyLines: true }).data
const comparison = Papa.parse(fs.readFileSync(`${dir}/player_index_comparison.csv`, "utf8"), { header: true, skipEmptyLines: true }).data
const summary = JSON.parse(fs.readFileSync(`${dir}/calculation_summary.json`, "utf8"))

test("Phase 126 package contains all 166 unpublished rolling-20 candidates", () => {
  assert.equal(candidates.length, 166)
  assert.equal(comparison.length, 166)
  assert.equal(summary.counts.official_eligible, 120)
  assert.equal(summary.counts.provisional, 46)
  assert.equal(summary.counts.not_yet_rated, 0)
  assert.ok(candidates.every((row) => row.publication_status === "UNPUBLISHED"))
  assert.ok(candidates.every((row) => row.source_scope === "KWT_ONLY"))
  assert.ok(candidates.every((row) => row.weekly_rows_used === "0"))
})

test("Phase 126 candidates average every active card and never select best five", () => {
  assert.ok(candidates.every((row) => JSON.parse(row.best_five_source_round_ids).length === 0))
  assert.ok(candidates.every((row) => JSON.parse(row.latest_ten_source_round_ids).length === 0))
  assert.ok(candidates.every((row) => JSON.parse(row.active_twenty_source_round_ids).length >= 1 && JSON.parse(row.active_twenty_source_round_ids).length <= 20))
  assert.ok(candidates.every((row) => Number(row.active_round_count) === JSON.parse(row.active_twenty_source_round_ids).length))
})

test("Phase 126 preserves deterministic identity and signed comparison values", () => {
  assert.equal(new Set(candidates.map((row) => row.canonical_player_id)).size, 166)
  assert.ok(candidates.every((row) => row.canonical_screen_name.trim().length > 0))
  assert.ok(candidates.every((row) => row.new_minus_old !== ""))
  assert.ok(candidates.every((row) => Number.isFinite(Number(row.resulting_index))))
  assert.ok(candidates.every((row) => /^[-+]?\d+\.\d{2}$/.test(row.golf_display_index)))
})
