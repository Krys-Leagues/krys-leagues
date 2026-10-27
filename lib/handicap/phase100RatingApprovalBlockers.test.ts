import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const manifest = JSON.parse(fs.readFileSync(path.join(root, "docs", "handicap", "phase100", "effective_period_manifest.json"), "utf8"))
const comparison = JSON.parse(fs.readFileSync(path.join(root, "docs", "handicap", "phase100", "recalculation_comparison.json"), "utf8"))
const ledgerLines = fs.readFileSync(path.join(root, "docs", "handicap", "phase100", "exception_resolution_ledger.csv"), "utf8").trim().split(/\r?\n/)
const periodLines = fs.readFileSync(path.join(root, "docs", "handicap", "phase100", "rating_effective_period_manifest.csv"), "utf8").trim().split(/\r?\n/)

test("Phase 100 preserves and classifies every historical exception", () => {
  assert.equal(ledgerLines.length, 809)
  assert.equal(manifest.sourceExceptions.find((entry: string[]) => entry[0] === "UNRESOLVED_CANONICAL_ID")[1], 806)
  assert.equal(manifest.sourceExceptions.find((entry: string[]) => entry[0] === "INVALID_SCORE")[1], 2)
  assert.equal(manifest.noCalendarDatesInvented, true)
})

test("Phase 100 keeps the corrected rating and index package unchanged", () => {
  assert.equal(manifest.readyRatings, 72)
  assert.equal(manifest.provisionalRatings, 6)
  assert.equal(periodLines.length, 79)
  assert.equal(comparison.recalculationRequired, false)
  assert.equal(comparison.ratingValuesChanged, 0)
  assert.equal(comparison.indexValuesChanged, 0)
  assert.equal(comparison.weeklyRowsInPersonalPackage, 0)
  assert.equal(comparison.ratingKwtRefsAllExist, true)
})
