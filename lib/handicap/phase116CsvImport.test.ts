import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import Papa from "papaparse"

const root = process.cwd()
const packageDir = path.join(root, "docs", "handicap", "phase114")
const harness = path.join(root, "scripts", "phase116_kwt_csv_import_local.mjs")

test("Phase 116 harness covers the complete CSV transaction contract", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, "package_manifest.json"), "utf8")) as Record<string, number>
  const rows = Papa.parse(fs.readFileSync(path.join(packageDir, "handicap_source_provenance_import.csv"), "utf8"), { header: true, skipEmptyLines: true }).data as Array<Record<string, string>>
  const source = fs.readFileSync(harness, "utf8")

  assert.equal(manifest.resolved_player_week_pairs, 364)
  assert.equal(manifest.quarantined_player_week_pairs, 7)
  assert.equal(rows.length, 728)
  assert.equal(new Set(rows.map(row => row.canonical_player_id)).size, 65)
  assert.match(source, /create temp table kwt_csv_import/)
  assert.match(source, /expectedPackageDistinctPlayers = 65/)
  assert.doesNotMatch(source, /count\(distinct canonical_player_id\) from kwt_csv_import\) <> 201/)
  assert.match(source, /source_fingerprint = incoming\.source_fingerprint/)
  assert.match(source, /source_season=incoming\.source_season/)
  assert.match(source, /existing\.metadata->>'difficulty'=incoming\.difficulty/)
  assert.match(source, /canonical_player_id uuid not null/)
  assert.match(source, /begin;[\s\S]*commit;/)
  assert.match(source, /duplicate fingerprint unexpectedly committed/)
  assert.match(source, /cross-namespace duplicate unexpectedly committed/)
  assert.match(source, /invalid canonical FK unexpectedly committed/)
  assert.match(source, /append-only mutation unexpectedly succeeded/)
})
