import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const packageRoot = join(process.cwd(), "docs", "handicap", "phase68")

type ProvenanceRow = {
  source_type: string
  source_fingerprint: string
  canonical_player_id: string
  metadata: string
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/)
  const parse = (line: string) => {
    const cells: string[] = []
    let cell = ""
    let quoted = false
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]
      if (char === '"') {
        if (quoted && line[index + 1] === '"') { cell += '"'; index += 1 }
        else quoted = !quoted
      } else if (char === "," && !quoted) { cells.push(cell); cell = "" }
      else cell += char
    }
    cells.push(cell)
    return cells
  }
  const header = parse(lines[0])
  return lines.slice(1).map((line) => Object.fromEntries(header.map((key, index) => [key, parse(line)[index] ?? ""])))
}

function provenanceRows(): ProvenanceRow[] {
  return parseCsv(readFileSync(join(packageRoot, "handicap_source_provenance_import.csv"), "utf8")) as unknown as ProvenanceRow[]
}

test("Phase 68 recovery package preserves exact source split and KWT identity metadata", () => {
  const rows = provenanceRows()
  assert.equal(rows.length, 14394)
  const kwt = rows.filter((row) => row.source_type === "KWT")
  const weekly = rows.filter((row) => row.source_type === "THE_WEEKLY")
  assert.equal(kwt.length, 13550)
  assert.equal(weekly.length, 844)
  assert.ok(kwt.every((row) => row.canonical_player_id && JSON.parse(row.metadata).source_player_id))
  assert.ok(weekly.every((row) => !row.canonical_player_id && JSON.parse(row.metadata).personal_handicap_eligible === false))
  assert.ok(kwt.every((row) => !row.source_fingerprint.includes("||")))
})

test("Phase 68 replacement snapshots are unpublished and scope-aware", () => {
  const manifest = JSON.parse(readFileSync(join(packageRoot, "rating_snapshot_import_manifest.json"), "utf8")) as {
    calculationRun: { id: string }
    ratingSnapshots: Array<{ id: string; calculation_run_id: string; review_scope: string; publication_status: string; effective_from: string | null }>
  }
  assert.equal(manifest.ratingSnapshots.length, 169)
  assert.equal(new Set(manifest.ratingSnapshots.map((row) => row.id)).size, 169)
  assert.ok(manifest.ratingSnapshots.every((row) => row.calculation_run_id === manifest.calculationRun.id))
  assert.ok(manifest.ratingSnapshots.every((row) => row.publication_status === "UNPUBLISHED" && row.effective_from === null))
  assert.deepEqual(
    Object.fromEntries([...new Set(manifest.ratingSnapshots.map((row) => row.review_scope))].sort().map((scope) => [scope, manifest.ratingSnapshots.filter((row) => row.review_scope === scope).length])),
    { KWT_ONLY: 78, KWT_PLUS_WEEKLY: 81, WEEKLY_ONLY: 10 },
  )
})

test("Phase 68 recovery manifest requires immutable quarantine and no index publication", () => {
  const recovery = JSON.parse(readFileSync(join(packageRoot, "recovery_manifest.json"), "utf8")) as {
    supersededRunId: string
    correctedRunId: string
    requiredChecks: string[]
  }
  assert.notEqual(recovery.supersededRunId, recovery.correctedRunId)
  assert.ok(recovery.requiredChecks.some((item) => item.includes("retained and quarantined")))
  assert.ok(recovery.requiredChecks.some((item) => item.includes("No rating or player-index publication")))
})
