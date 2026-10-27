import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const root = process.cwd()
const route = fs.readFileSync(path.join(root, "app/api/players/[id]/handicap/route.ts"), "utf8")
const profile = fs.readFileSync(path.join(root, "app/players/[id]/page.tsx"), "utf8")

test("public profile Handicap route uses only the public guarded RPC", () => {
  assert.match(route, /createServerSupabaseClient\(\)/)
  assert.match(route, /get_public_published_handicap_for_player/)
  assert.doesNotMatch(route, /createAdminDataClient|handicap_publishable_index_snapshots|\.from\(/)
  assert.doesNotMatch(route, /source_round_ids|rating_snapshot_ids|source_fingerprint|differential_value|provenance/i)
  assert.match(route, /Cache-Control.*no-store/)
})

test("public profile renders only the route payload and keeps golf notation display-only", () => {
  assert.match(profile, /\/api\/players\/\$\{encodeURIComponent\(canonicalId\)\}\/handicap/)
  assert.match(profile, /HANDICAP/)
  assert.match(profile, /Handicap History/)
  assert.match(profile, /NOT YET RATED/)
  assert.match(profile, /formatGolfHandicapIndex/)
  assert.doesNotMatch(profile, /player_index_candidates\.csv|phase126|UNPUBLISHED|QUARANTINED/)
})
