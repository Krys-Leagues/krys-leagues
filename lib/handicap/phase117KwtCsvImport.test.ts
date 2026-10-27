import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import Papa from "papaparse"

const root = process.cwd()
const packageDir = path.join(root, "docs", "handicap", "phase117")
const manifestHash = "E808D8459AC131E384CCA0F2D44ED230B8513EA61671149322EDDEA1972230E3"

function hash(file: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(packageDir, file))).digest("hex").toUpperCase()
}

test("Phase 117 package preserves provenance-only scope and deterministic checksums", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, "package_manifest.json"), "utf8")) as Record<string, unknown>
  const rows = Papa.parse(fs.readFileSync(path.join(packageDir, "handicap_source_provenance_import.csv"), "utf8"), { header: true, skipEmptyLines: true }).data as Array<Record<string, string>>
  const exceptions = Papa.parse(fs.readFileSync(path.join(packageDir, "handicap_source_provenance_exceptions.csv"), "utf8"), { header: true, skipEmptyLines: true }).data as Array<Record<string, string>>
  const checksums = JSON.parse(fs.readFileSync(path.join(packageDir, "package_checksums.json"), "utf8")) as { artifacts: Record<string, { sha256: string }> }

  assert.equal(manifest.source_manifest_sha256, manifestHash)
  assert.equal(manifest.calculation_run_id, "9a9a4bc4-e43d-55d4-84fb-a83c0b757681")
  assert.equal(rows.length, 728)
  assert.equal(new Set(rows.map(row => row.canonical_player_id)).size, 65)
  assert.equal(rows.filter(row => row.difficulty === "easy").length, 364)
  assert.equal(rows.filter(row => row.difficulty === "hard").length, 364)
  assert.equal(new Set(rows.map(row => `${row.source_season}|${row.source_week}|${row.canonical_player_id}`)).size, 364)
  assert.equal(exceptions.length, 7)
  const importedPairs = new Set(rows.map(row => `${row.source_season}|${row.source_week}|${row.original_player_name}`))
  for (const exception of exceptions) assert.equal(importedPairs.has(`${exception.season}|${exception.week}|${exception.original_player_name}`), false, `${exception.event_id}/${exception.original_player_name} was imported`)
  assert.equal(rows.filter(row => row.source_type === "THE_WEEKLY").length, 0)
  assert.equal(rows.filter(row => JSON.parse(row.metadata).personal_handicap_eligible !== true).length, 0)
  assert.equal(new Set(rows.map(row => row.id)).size, 728)
  for (const [file, metadata] of Object.entries(checksums.artifacts)) assert.equal(hash(file), metadata.sha256, `${file} checksum`)
})

test("Phase 117 SQL is append-only, transactional, and excludes rating/index imports", () => {
  const preflight = fs.readFileSync(path.join(packageDir, "production_preflight.sql"), "utf8")
  const install = fs.readFileSync(path.join(packageDir, "production_install.sql"), "utf8")
  const postflight = fs.readFileSync(path.join(packageDir, "production_postflight.sql"), "utf8")

  assert.match(preflight, /27944/)
  assert.match(preflight, /410/)
  assert.match(preflight, /157/)
  assert.match(preflight, /844/)
  assert.match(preflight, /Phase 117 run already exists/)
  assert.match(install, /pg_advisory_xact_lock/)
  assert.match(install, /\\copy phase117_kwt_import .* from stdin/)
  assert.doesNotMatch(install, /phase117_import_csv/)
  assert.match(install, /begin;[\s\S]*commit;/)
  assert.match(install, /insert into public\.handicap_calculation_runs/)
  assert.match(install, /insert into public\.handicap_source_provenance/)
  assert.doesNotMatch(install, /insert into public\.handicap_(rating|index)_snapshots/)
  assert.doesNotMatch(install, /\b(update|delete|truncate)\s+public\./i)
  assert.match(install, /publication_eligibility.*QUARANTINED/)
  assert.match(postflight, /28672/)
  assert.match(postflight, /publishable_ratings/)
  assert.match(postflight, /publishable_indexes/)
})
