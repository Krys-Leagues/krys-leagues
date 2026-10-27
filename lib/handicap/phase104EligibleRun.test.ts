import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import Papa from "papaparse"

const root = process.cwd()
const phase104 = path.join(root, "docs", "handicap", "phase104")

function csv(name: string): Record<string, string>[] {
  const result = Papa.parse(fs.readFileSync(path.join(phase104, name), "utf8"), { header: true, skipEmptyLines: true })
  assert.equal(result.errors.length, 0, `${name} must parse without errors`)
  return result.data as Record<string, string>[]
}

function array(value: string): string[] {
  return JSON.parse(value) as string[]
}

test("Phase 104 package has the approved unpublished counts and scope", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(phase104, "calculation_run_manifest.json"), "utf8"))
  assert.equal(manifest.counts.readyRatingSnapshots, 72)
  assert.equal(manifest.counts.provisionalRatingsExcluded, 6)
  assert.equal(manifest.counts.playerIndexSnapshots, 157)
  assert.equal(manifest.counts.blockedPlayers, 44)
  assert.equal(manifest.counts.effectiveFromValuesInvented, 0)
  assert.equal(manifest.calculationRun.status, "DRAFT")
  assert.equal(manifest.calculationRun.publication_eligibility, "QUARANTINED")
  assert.equal(manifest.calculationRun.metadata.source_scope, "KWT_ONLY")
  assert.equal(manifest.calculationRun.metadata.allow_official_kwt_sequence_publication, true)
})

test("Phase 104 ratings preserve Season/Week periods and cannot publish by default", () => {
  const rows = csv("rating_snapshot_import_rows.csv")
  assert.equal(rows.length, 72)
  const ids = new Set(rows.map((row) => row.id))
  assert.equal(ids.size, 72)
  for (const row of rows) {
    assert.equal(row.publication_status, "UNPUBLISHED")
    assert.equal(row.review_scope, "KWT_ONLY")
    assert.equal(row.statistical_eligibility, "ELIGIBLE")
    assert.equal(row.import_eligible, "true")
    assert.equal(row.publication_eligible, "false")
    assert.equal(row.effective_from, "")
    assert.match(row.effective_period, /^KWT S\d+W\d+ through S\d+W\d+; observed S\d+W\d+(, S\d+W\d+)*; OFFICIAL_KWT_SEQUENCE; calendar date unavailable$/)
    assert.ok(Number(row.slope) > 0.01)
    assert.ok(array(row.source_evidence_refs).length > 0)
    assert.ok(array(row.source_evidence_refs).every((ref) => ref.startsWith("KWT|")))
  }
})

test("Phase 104 indexes preserve KWT-only provenance and official sequence", () => {
  const rows = csv("index_snapshot_import_rows.csv")
  assert.equal(rows.length, 157)
  assert.equal(new Set(rows.map((row) => row.id)).size, 157)
  for (const row of rows) {
    assert.equal(row.chronology_confidence, "OFFICIAL_KWT_SEQUENCE")
    assert.equal(row.publication_status, "UNPUBLISHED")
    assert.match(row.differential_model_version, /^krys-handicap-candidate-a-v1$/)
    assert.ok(array(row.source_round_ids).length >= 5)
    assert.ok(array(row.latest_ten_source_round_ids).length <= 10)
    assert.ok(array(row.best_five_source_round_ids).length <= 5)
    assert.ok(array(row.source_round_ids).every((ref) => ref.startsWith("KWT|")))
    assert.ok(array(row.rating_snapshot_ids).every((id) => /^[0-9a-f-]{36}$/i.test(id)))
  }
})

test("Phase 104 excludes provisional courses and Weekly from personal indexes", () => {
  const provisional = csv("provisional_rating_exclusions.csv")
  const indexes = csv("index_snapshot_import_rows.csv")
  assert.equal(provisional.length, 6)
  assert.ok(provisional.every((row) => row.reason === "PROVISIONAL_SAMPLE_EXCLUDED_FROM_FIRST_ELIGIBLE_RUN"))
  assert.ok(indexes.every((row) => !row.source_round_ids.includes("THE_WEEKLY")))
})
