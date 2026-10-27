import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import Papa from "papaparse"
import { validateOfficialKwtCsvFingerprint } from "./phase112KwtCsv.ts"

const root = process.cwd()
const packageDir = path.join(root, "docs", "handicap", "phase114")
const readCsv = (file: string): Array<Record<string, string>> => {
  const result = Papa.parse<Record<string, string>>(fs.readFileSync(path.join(packageDir, file), "utf8"), { header: true, skipEmptyLines: true })
  assert.equal(result.errors.length, 0, `${file} must parse without CSV errors`)
  return result.data
}

test("Phase 114 reconciles verified identities without duplicate fingerprints", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, "package_manifest.json"), "utf8")) as Record<string, number>
  const rows = readCsv("handicap_source_provenance_import.csv")
  const exceptions = readCsv("handicap_source_provenance_exceptions.csv")
  const identities = readCsv("identity_resolution.csv")
  const candidates = readCsv("identity_match_candidates.csv")

  assert.equal(manifest.resolved_player_week_pairs, 364)
  assert.equal(manifest.quarantined_player_week_pairs, 7)
  assert.equal(manifest.import_candidate_course_observations, 728)
  assert.equal(manifest.quarantined_course_observations, 14)
  assert.equal(rows.length, 728)
  assert.equal(exceptions.length, 7, "exceptions are one row per quarantined player-week pair")
  assert.equal(new Set(rows.map(row => row.source_fingerprint)).size, rows.length)
  assert.equal(rows.filter(row => row.source_type !== "KWT").length, 0)
  assert.equal(rows.filter(row => !validateOfficialKwtCsvFingerprint(row.source_fingerprint)).length, 0)
  assert.equal(rows.filter(row => row.difficulty === "easy").length, 364)
  assert.equal(rows.filter(row => row.difficulty === "hard").length, 364)
  assert.ok(rows.some(row => Number(row.score) < 0), "negative golf scores remain represented")

  const ownerMappings = new Map([
    ["bigja33", "69c0daa5-70b8-481b-94e5-a9d033bc75fb"],
    ["Andrew_Holmes", "797063d6-62f9-414f-bd92-e18780ed8e52"],
    ["WendyW(Wyndemere2020)", "7befb54f-6eec-4c7c-9881-c75d1acfb8d8"],
  ])
  for (const [name, id] of ownerMappings) assert.equal(identities.find(row => row.source_name === name)?.canonical_player_id, id)
  assert.equal(candidates.length, 11)
  assert.deepEqual(new Set(candidates.filter(row => row.action === "QUARANTINE").map(row => row.original_name)), new Set(["Honeybee1998", "Stephen1D47", "¿¿¿¿¿¿"]))
  const julianLead = candidates.find(row => row.original_name === "¿¿¿¿¿¿")
  assert.equal(julianLead?.candidate_player_id, "57d7ddc3-1cd4-4e17-97cf-30343e26ced0")
  assert.equal(julianLead?.confidence, "LEAD_NOT_CONFIRMED")
  assert.equal(julianLead?.action, "QUARANTINE")
  assert.equal(rows.some(row => row.source_type === "THE_WEEKLY"), false)
})
