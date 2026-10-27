import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import Papa from "papaparse"

const root = process.cwd()
const output = path.join(root, "docs", "handicap", "phase119")
function csv(name: string): Record<string, string>[] {
  return Papa.parse(fs.readFileSync(path.join(output, name), "utf8"), { header: true, skipEmptyLines: true }).data as Record<string, string>[]
}

test("Phase 119 emits all 33 large movement diagnostics with exact round evidence", () => {
  const summary = csv("phase119_movement_summary.csv")
  const rounds = csv("phase119_movement_rounds.csv")
  assert.equal(summary.length, 33)
  assert.ok(rounds.length >= summary.length)
  assert.ok(summary.some((row) => row.canonical_screen_name === "YUK1N" && row.cause))
  assert.ok(summary.some((row) => row.canonical_screen_name === "KILLERBEE" && row.cause))
  assert.ok(summary.some((row) => row.canonical_screen_name === "ULTRAFOX_LYNNE" && row.cause))
  assert.ok(rounds.every((row) => row.chronology === "OFFICIAL_KWT_SEQUENCE"))
})

test("Phase 119 keeps Weekly evidence out of personal-index diagnostics", () => {
  const summary = csv("phase119_movement_summary.csv")
  const rounds = csv("phase119_movement_rounds.csv")
  assert.ok(summary.every((row) => row.weekly_rows_used === "0"))
  assert.ok(rounds.every((row) => row.source !== "THE_WEEKLY"))
})

test("Phase 119 reconciles the official 82-course catalog", () => {
  const coverage = csv("phase119_coverage_reconciliation.csv")
  const missing = coverage.find((row) => row.category === "MISSING_FROM_PHASE118_MODELS")
  assert.equal(missing?.count, "1")
  assert.equal(coverage.find((row) => row.category === "OFFICIAL_CATALOG_TOTAL")?.count, "82")
  assert.equal(coverage.find((row) => row.category === "PHASE118_MODELED_TOTAL")?.count, "81")
})

test("Phase 119 retains read-only non-publication status", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(output, "phase119_package_manifest.json"), "utf8")) as { status: string; counts: { quarantinedPairsUsed: number; weeklyRowsUsedInIndexes: number } }
  assert.equal(manifest.status, "LOCAL_ONLY_READ_ONLY_NOT_FOR_PUBLICATION")
  assert.equal(manifest.counts.quarantinedPairsUsed, 0)
  assert.equal(manifest.counts.weeklyRowsUsedInIndexes, 0)
})
