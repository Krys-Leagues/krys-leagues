import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const packageRoot = join(process.cwd(), "docs", "handicap", "phase63")

test("Phase 63 package has complete provenance and unpublished snapshot coverage", () => {
  const manifest = JSON.parse(readFileSync(join(packageRoot, "rating_snapshot_import_manifest.json"), "utf8")) as {
    calculationRun: { id: string; status: string }
    ratingSnapshots: Array<{
      id: string
      calculation_run_id: string
      course_id: string
      difficulty: string
      model_version: string
      publication_status: string
      effective_from: string | null
    }>
  }
  const provenance = readFileSync(join(packageRoot, "handicap_source_provenance_import.csv"), "utf8")
    .trimEnd()
    .split(/\r?\n/)

  assert.equal(provenance.length - 1, 14394)
  assert.equal(manifest.ratingSnapshots.length, 169)
  assert.equal(manifest.calculationRun.status, "DRAFT")
  assert.equal(new Set(manifest.ratingSnapshots.map((row) => row.id)).size, 169)
  assert.ok(manifest.ratingSnapshots.every((row) => row.publication_status === "UNPUBLISHED"))
  assert.ok(manifest.ratingSnapshots.every((row) => row.effective_from === null))
})

test("Phase 63 package exposes the installed-schema uniqueness blocker instead of skipping rows", () => {
  const manifest = JSON.parse(readFileSync(join(packageRoot, "rating_snapshot_import_manifest.json"), "utf8")) as {
    ratingSnapshots: Array<{ calculation_run_id: string; course_id: string; difficulty: string; model_version: string }>
  }
  const keys = new Set(manifest.ratingSnapshots.map((row) => [row.calculation_run_id, row.course_id, row.difficulty, row.model_version].join("|")))
  assert.equal(keys.size, 81)
  assert.equal(manifest.ratingSnapshots.length - keys.size, 88)
})
