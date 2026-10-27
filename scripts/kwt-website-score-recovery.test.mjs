import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../docs/historical-sources/kwt/website-score-recovery/", import.meta.url)
const readJson = async (file) => JSON.parse(await readFile(new URL(file, root), "utf8"))

test("recovered KWT catalog is KWT-only and source-manifested", async () => {
  const report = await readJson("recovery-report.json")
  const manifest = await readJson("raw-response-manifest.json")
  assert.deepEqual({ seasons: report.seasons, weeks: report.weeks, rows: report.playerWeekRows }, { seasons: 11, weeks: 124, rows: 7179 })
  assert.equal(manifest.sources.length, 124)
  assert.equal(new Set(manifest.sources.map((source) => source.sha256)).size, 124)
  assert.equal(manifest.sources.some((source) => source.sourceId.startsWith("KR")), false)
  assert.equal(report.duplicateSources, 0)
  assert.equal(report.duplicateRows, 0)
  assert.equal(report.conflictingScoreObservations, 0)
  assert.equal(report.incorrectTotals, 0)
  assert.equal(report.earliestSeasonWeek, "4-W01")
  assert.equal(report.latestSeasonWeek, "14-W04")
})

test("recovered preview preserves blocked source facts and identity-review scope", async () => {
  const report = await readJson("recovery-report.json")
  const parser = await readJson("parser-preview-report.json")
  const candidates = await readJson("identity-candidates.json")
  assert.equal(report.easyScoreObservations, 7179)
  assert.equal(report.hardScoreObservations, 7177)
  assert.equal(report.blockedMalformedRows, 2)
  assert.equal(parser.parsedRows, 7177)
  assert.equal(parser.parserErrors, 2)
  assert.equal(parser.parserWarnings, 4)
  assert.equal(candidates.generatedFromScoreRowsOnly, true)
  assert.equal(candidates.candidates.length, 213)
  assert.equal(report.exactAutomaticIdentityCandidates, 202)
  assert.equal(report.ambiguousIdentities, 6)
  assert.equal(report.missingIdentities, 5)
})
