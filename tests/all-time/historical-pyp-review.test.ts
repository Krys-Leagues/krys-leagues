import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"

import { parseHistoricalPypPackage } from "../../lib/importer/adapters/historicalPypParser.ts"

const read = (path: string) => readFileSync(path, "utf8")
const root = "docs/historical-sources/pyp/google-sheets-recovery"

test("Historical PYP exposes a protected Match-style review route", () => {
  const route = read("app/api/admin/historical-pyp/route.ts")
  const identityRoute = read("app/api/admin/historical-pyp/identity/route.ts")
  const applyRoute = read("app/api/admin/historical-pyp/apply/route.ts")
  const reviewRoute = read("app/api/admin/historical-pyp/route.ts")
  const page = read("app/admin/import/pyp/page.tsx")
  assert.match(route, /authorizedAdminClient\(request\)/)
  assert.match(route, /historical-pyp-normalized\.csv/)
  assert.match(page, /Review only — no PYP scores are committed/)
  assert.match(page, /Previous/)
  assert.match(page, /Next/)
  assert.match(page, /Needs Review only/)
  assert.match(identityRoute, /remember_verified_player_alias/)
  assert.match(applyRoute, /commit_historical_pyp_preview/)
  assert.match(reviewRoute, /classifyHistoricalPypPreflight/)
  assert.match(reviewRoute, /historical_pyp_observations/)
  assert.match(page, /PRODUCTION-ONLY/)
  assert.match(page, /TRUE CONFLICT/)
  assert.match(page, /PREFLIGHT_CLASSIFICATIONS\.map/)
  assert.match(page, /preflightSourceCount/)
  assert.match(page, /Commit Historical PYP/)
  assert.match(page, /Unknown\/nonblocking opponent rows/)
  assert.match(page, /I explicitly confirm this reviewed PYP preview is ready/)
  assert.match(page, /sourceSha256/)
  assert.match(page, /previewFingerprint/)
})

test("Historical PYP public reads stay in the PYP family and use canonical players", () => {
  const standings = read("app/pyp-standings/page.tsx")
  const pypHub = read("app/pyp/page.tsx")
  const profile = read("app/players/[id]/page.tsx")
  const sql = read("historical_pyp_import_foundation.sql")
  assert.match(standings, /list_public_historical_pyp_seasons/)
  assert.match(standings, /get_public_historical_pyp_final_scorecard/)
  assert.match(profile, /get_public_historical_pyp_player_history/)
  assert.doesNotMatch(pypHub, /href="\/matches"/)
  assert.match(sql, /get_public_historical_pyp_player_history/)
  assert.match(sql, /resolve_canonical_player_id\(observation\.canonical_player_id\)/)
  assert.match(sql, /grant execute on function public\.get_public_historical_pyp_player_history\(uuid\) to anon, authenticated/)
  assert.doesNotMatch(sql, /player_aliases/)
})

test("Historical PYP review keeps holes-won states and source names exact", () => {
  const page = read("app/admin/import/pyp/page.tsx")
  assert.match(page, /C1 and C2 are holes won, not golf-stroke scores/)
  assert.match(page, /37 numeric 0\/0 cases remain UNPLAYED/)
  assert.match(page, /YODA \(S10\/D1\/G3\)/)
  assert.match(page, /AUDREY \(S11\/D3\/G2\)/)
  assert.match(page, /historicalPlayerName/)
  assert.match(page, /Select only an existing canonical Global Player/)
})

test("PYP review package reproduces the approved counts", () => {
  const preview = parseHistoricalPypPackage(
    read(`${root}/historical-pyp-normalized.csv`),
    read(`${root}/historical-pyp-opponent-evidence.csv`),
    read(`${root}/historical-pyp-rank-conflicts.csv`),
  )
  assert.deepEqual(preview.historicalSeasons, Array.from({ length: 14 }, (_, index) => index + 1))
  assert.deepEqual(preview.currentExcludedSeasons, [15])
  assert.equal(preview.audit.exactHistoricalNames, 79)
  assert.equal(preview.audit.participantSeasonDivisionRows, 265)
  assert.equal(preview.audit.playerGameSlots, 795)
  assert.equal(preview.audit.playedSlots, 560)
  assert.equal(preview.audit.unplayedSlots, 235)
  assert.equal(preview.audit.playedZeroSlots, 2)
  assert.equal(preview.audit.unplayedZeroZeroSlots, 37)
  assert.equal(preview.audit.publishedPlacementConflicts, 184)
  assert.equal(preview.audit.usableOpponentEvidenceRecords, 60)
  assert.equal(preview.audit.unusableOpponentEvidenceRecords, 6)
})

test("PYP preserved source artifacts match the manifest", () => {
  const manifest = JSON.parse(read(`${root}/source-manifest.json`)) as { artifactHashes: Record<string, string> }
  for (const [artifact, expected] of Object.entries(manifest.artifactHashes)) {
    const actual = createHash("sha256").update(read(`${root}/${artifact}`), "utf8").digest("hex").toUpperCase()
    assert.equal(actual, expected.toUpperCase(), artifact)
  }
})

test("PYP review never invents missing opponents", () => {
  const preview = parseHistoricalPypPackage(
    read(`${root}/historical-pyp-normalized.csv`),
    read(`${root}/historical-pyp-opponent-evidence.csv`),
    read(`${root}/historical-pyp-rank-conflicts.csv`),
  )
  assert.ok(preview.rows.some((row) => row.pairingState === "UNKNOWN" && row.opponentHistoricalPlayerName === null))
  assert.ok(preview.pairingReviews.every((review) => review.opponentHistoricalPlayerName === null))
  assert.equal(preview.audit.actionablePairingReviews, 0)
})
