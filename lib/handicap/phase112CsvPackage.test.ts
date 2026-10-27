import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import Papa from "papaparse"
import { validateOfficialKwtCsvFingerprint } from "./phase112KwtCsv.ts"

const root = process.cwd()
const packageDir = path.join(root, "docs", "handicap", "phase112")
const phase68Dir = path.join(root, "docs", "handicap", "phase68")

function readCsv(file: string): Array<Record<string, string>> {
  const result = Papa.parse<Record<string, string>>(fs.readFileSync(path.join(packageDir, file), "utf8"), {
    header: true,
    skipEmptyLines: true,
  })
  assert.equal(result.errors.length, 0, `${file} must parse without CSV errors`)
  return result.data
}

test("Phase 112 package has deterministic, collision-free KWT provenance", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, "package_manifest.json"), "utf8")) as {
    resolved_player_week_pairs: number
    quarantined_player_week_pairs: number
    import_candidate_course_observations: number
    quarantined_course_observations: number
  }
  const rows = readCsv("handicap_source_provenance_import.csv")
  const oldRows = Papa.parse<Record<string, string>>(fs.readFileSync(path.join(phase68Dir, "handicap_source_provenance_import.csv"), "utf8"), {
    header: true,
    skipEmptyLines: true,
  }).data
  const oldFingerprints = new Set(oldRows.map(row => row.source_fingerprint))
  const fingerprints = rows.map(row => row.source_fingerprint)

  assert.equal(manifest.resolved_player_week_pairs, 324)
  assert.equal(manifest.quarantined_player_week_pairs, 47)
  assert.equal(manifest.import_candidate_course_observations, 648)
  assert.equal(manifest.quarantined_course_observations, 94)
  assert.equal(rows.length, 648)
  assert.equal(new Set(fingerprints).size, rows.length)
  assert.equal(fingerprints.filter(fingerprint => oldFingerprints.has(fingerprint)).length, 0)
  assert.equal(rows.filter(row => row.source_type !== "KWT").length, 0)
  assert.equal(rows.filter(row => !validateOfficialKwtCsvFingerprint(row.source_fingerprint)).length, 0)
  assert.equal(rows.filter(row => row.difficulty === "easy").length, 324)
  assert.equal(rows.filter(row => row.difficulty === "hard").length, 324)
  assert.ok(rows.some(row => Number(row.score) < 0), "negative golf scores must remain represented")

  for (const row of rows) {
    assert.match(row.canonical_player_id, /^[0-9a-f-]{36}$/i)
    const metadata = JSON.parse(row.metadata) as Record<string, unknown>
    assert.equal(metadata.provenance_namespace, "OFFICIAL_KWT_CSV")
    assert.equal(metadata.source_ids_present_in_export, false)
    assert.equal(metadata.official_sequence, "SEASON_WEEK_EASY_HARD")
    assert.equal(metadata.personal_handicap_eligible, true)
  }
})

test("Phase 112 unresolved identities are quarantined and Weekly is absent", () => {
  const exceptions = readCsv("handicap_source_provenance_exceptions.csv")
  const identities = readCsv("identity_resolution.csv")
  const rows = readCsv("handicap_source_provenance_import.csv")

  assert.equal(exceptions.length, 47)
  assert.ok(exceptions.every(row => row.status === "QUARANTINED_UNRESOLVED_CANONICAL_IDENTITY"))
  assert.ok(identities.some(row => row.resolution === "QUARANTINED"))
  assert.ok(identities.every(row => row.source_discord_id_used === "NO"))
  assert.equal(rows.some(row => row.source_type === "THE_WEEKLY"), false)
})
