import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { parseHistoricalStrokeV2Package } from "../../lib/importer/adapters/historicalStrokeV2.ts"

const read = (path: string) => readFileSync(path, "utf8")

test("Historical Stroke V2 has a protected source-backed review route", () => {
  const route = read("app/api/admin/historical-stroke-v2/route.ts")
  const page = read("app/admin/import/stroke-v2/page.tsx")
  assert.match(route, /authorizedAdminClient\(request\)/)
  assert.match(route, /historical-stroke-normalized\.csv/)
  assert.match(route, /historical-stroke-pairings\.csv/)
  assert.match(route, /historical-stroke-season5-malformed\.csv/)
  assert.match(page, /Review only — no Stroke scores are committed/)
  assert.match(page, /historical-stroke-v2-identity-review/)
  assert.match(page, /previewFingerprint/)
  assert.match(page, /allowedPlayerIds/)
  assert.match(page, /Commit Historical Stroke V2 \(review-only phase\)/)
})

test("Stroke V2 review preserves source-state blockers and excludes identity guesses", () => {
  const page = read("app/admin/import/stroke-v2/page.tsx")
  assert.match(page, /Season 62 remains current\/incomplete evidence only/)
  assert.match(page, /Season 5 malformed rows and unsupported source tokens remain blocked/)
  assert.match(page, /Unknown opponent evidence does not block otherwise valid score observations/)
  assert.match(page, /only existing canonical Global Players may be selected/)
  assert.match(page, /Blank\/dash\/source-token observations.*remain excluded/i)
})

test("Import Center links directly to the protected Stroke V2 identity review", () => {
  const page = read("app/admin/import/page.tsx")
  assert.match(page, /Historical Stroke V2/)
  assert.match(page, /\/admin\/import\/stroke-v2/)
})

test("The source-backed identity scope is exactly Seasons 1–61 and 246 names", async () => {
  const root = "docs/historical-sources/stroke/google-sheets-recovery"
  const preview = await parseHistoricalStrokeV2Package({
    normalizedCsv: readFileSync(`${root}/historical-stroke-normalized.csv`, "utf8"),
    manifestJson: readFileSync(`${root}/stroke-source-manifest.json`, "utf8"),
    pairingCsv: readFileSync(`${root}/historical-stroke-pairings.csv`, "utf8"),
    malformedCsv: readFileSync(`${root}/historical-stroke-season5-malformed.csv`, "utf8"),
  })
  const names = new Set(preview.observations.map((row) => row.historicalPlayerName).filter(Boolean))
  assert.equal(names.size, 246)
  assert.deepEqual([...new Set(preview.observations.map((row) => row.season))], Array.from({ length: 61 }, (_, index) => index + 1))
  assert.equal(preview.audit.playedObservations, 4767)
  assert.equal(preview.audit.unplayedObservations, 971)
  assert.equal(preview.audit.confirmedPairings, 1312)
  assert.equal(preview.audit.unknownPairings, 2976)
})
