import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const packageRoot = join(process.cwd(), "docs", "handicap", "phase63")

type Snapshot = {
  id: string
  calculation_run_id: string
  course_id: string
  difficulty: string
  model_version: string
  review_scope: string
  publication_status: string
  effective_from: string | null
}

function snapshots(): Snapshot[] {
  const manifest = JSON.parse(readFileSync(join(packageRoot, "rating_snapshot_import_manifest.json"), "utf8")) as { ratingSnapshots: Snapshot[] }
  return manifest.ratingSnapshots
}

test("Phase 65 preserves the three evidence scopes as snapshot identity", () => {
  const rows = snapshots()
  const allowed = new Set(["KWT_ONLY", "WEEKLY_ONLY", "KWT_PLUS_WEEKLY"])
  const scopeCounts = rows.reduce<Record<string, number>>((counts, row) => {
    assert.ok(allowed.has(row.review_scope))
    counts[row.review_scope] = (counts[row.review_scope] ?? 0) + 1
    return counts
  }, {})

  assert.deepEqual(scopeCounts, { KWT_ONLY: 78, WEEKLY_ONLY: 10, KWT_PLUS_WEEKLY: 81 })
  assert.equal(new Set(rows.map((row) => [row.calculation_run_id, row.course_id, row.difficulty, row.model_version, row.review_scope].join("|"))).size, 169)
  assert.equal(new Set(rows.map((row) => row.id)).size, 169)
})

test("Phase 65 keeps the mathematical model shared across review scopes", () => {
  const rows = snapshots()
  assert.equal(new Set(rows.map((row) => row.model_version)).size, 1)
  assert.ok(rows.every((row) => row.publication_status === "UNPUBLISHED"))
  assert.ok(rows.every((row) => row.effective_from === null))
})
