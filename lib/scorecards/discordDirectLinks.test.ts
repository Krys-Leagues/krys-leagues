import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")

test("direct links are signed navigation targets and exclude Doubles", () => {
  const source = read("lib/scorecards/deepLink.ts")
  assert.match(source, /createHmac/)
  assert.match(source, /timingSafeEqual/)
  assert.match(source, /adapterKey: \"pyp\" \| \"stroke\" \| \"match\"/)
  assert.match(source, /sourceKey/)
  assert.doesNotMatch(source, /playerId|discordUserId|storage_path|signedUrl/)
  assert.match(source, /validComponent/)
  assert.match(source, /parseScorecardDeepLinkToken/)
})

test("Match evidence is fixture-shared and the player center supports direct links", () => {
  const server = read("lib/scorecards/server.ts")
  const admin = read("components/admin/scorecards/SharedScorecardReviewer.tsx")
  const available = read("app/api/scorecards/available/route.ts")
  const page = read("components/scorecards/PlayerScorecardSubmission.tsx")
  assert.match(server, /const componentKey = \"primary\"/)
  assert.match(admin, /review\.context\.adapter_key === \"pyp\" \? activeComponent : \"primary\"/)
  assert.match(available, /parseScorecardDeepLinkToken/)
  assert.match(available, /contexts\.unshift/)
  assert.match(page, /location\.search\).*get\("fixture"\)/)
  assert.match(page, /onDrop/)
  assert.match(page, /REPLACE SCORECARD/)
  assert.match(page, /VERIFIED/)
})

test("Discord status returns SUBMIT/SUBMITTED/VERIFIED without polling", () => {
  const status = read("app/api/internal/scorecards/discord/status/route.ts")
  const upload = read("app/api/internal/scorecards/discord/upload/route.ts")
  assert.match(status, /verifyScorecardBridgeRequest/)
  assert.match(status, /SUBMIT|SUBMITTED|VERIFIED/)
  assert.match(status, /createScorecardDeepLink/)
  assert.match(upload, /x-krys-scorecard-action/)
  assert.match(upload, /x-krys-scorecard-evidence-id/)
  assert.doesNotMatch(`${status}${upload}`, /setInterval|setTimeout/)
})

test("replacement audit locks verified evidence and reopens only non-verified evidence", () => {
  const server = read("lib/scorecards/server.ts")
  const migration = read("supabase/migrations/20261003150000_shared_scorecard_evidence_replacement.sql")
  assert.match(server, /verified_locked/)
  assert.match(server, /shared_scorecard_evidence_replacements/)
  assert.match(server, /review_status: \"replaced\"/)
  assert.match(migration, /shared_scorecard_evidence_replacements/)
  assert.match(migration, /replacement_status in \('reserved', 'completed', 'rolled_back'\)/)
  assert.match(migration, /review_status in \('uploading', 'submitted', 'under_review', 'reopened', 'verified'\)/)
})
