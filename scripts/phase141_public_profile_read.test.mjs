import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const root = process.cwd()
const proposal = fs.readFileSync(path.join(root, "supabase/proposals/20261022_handicap_public_profile_read_rpc.proposed.sql"), "utf8")
const preflight = fs.readFileSync(path.join(root, "docs/handicap/phase141/public_profile_read_preflight.sql"), "utf8")
const postflight = fs.readFileSync(path.join(root, "docs/handicap/phase141/public_profile_read_postflight.sql"), "utf8")
const route = fs.readFileSync(path.join(root, "app/api/players/[id]/handicap/route.ts"), "utf8")
const profile = fs.readFileSync(path.join(root, "app/players/[id]/page.tsx"), "utf8")

test("public profile RPC is a safe published-only contract", () => {
  assert.match(proposal, /handicap_private\.get_public_published_handicap_for_player/)
  assert.match(proposal, /security definer/i)
  assert.match(proposal, /set search_path = ''/i)
  assert.match(proposal, /public\.handicap_publishable_index_snapshots/)
  assert.match(proposal, /grant execute on function public\.get_public_published_handicap_for_player\(uuid\) to anon, authenticated/i)
  assert.match(proposal, /grant usage on schema handicap_private to anon, authenticated/i)
  assert.match(proposal, /grant execute on function handicap_private\.get_public_published_handicap_for_player\(uuid\) to anon, authenticated/i)
  assert.match(proposal, /revoke all on function public\.get_public_published_handicap_for_player\(uuid\) from public/i)
  assert.doesNotMatch(proposal, /source_round_ids|rating_snapshot_ids|source_fingerprint|provenance|review_evidence/i)
})

test("public profile installation package includes read-only preflight and postflight", () => {
  assert.match(preflight, /SET TRANSACTION READ ONLY/i)
  assert.match(preflight, /public_profile_read_preflight_passed/)
  assert.doesNotMatch(preflight, /\b(insert|update|delete|alter|create)\b/i)
  assert.match(postflight, /public_profile_read_postflight_passed/)
  assert.doesNotMatch(postflight, /\b(insert|update|delete|alter|create)\b/i)
})

test("route does not use the service role or expose direct Handicap tables", () => {
  assert.match(route, /createServerSupabaseClient\(\)/)
  assert.match(route, /get_public_published_handicap_for_player/)
  assert.doesNotMatch(route, /createAdminDataClient|\.from\(|handicap_index_snapshots|handicap_publishable_index_snapshots/)
})

test("profile shows a safe not-rated state and published history only", () => {
  assert.match(profile, /NOT YET RATED/)
  assert.match(profile, /Handicap History/)
  assert.match(profile, /formatGolfHandicapIndex/)
  assert.doesNotMatch(profile, /UNPUBLISHED|QUARANTINED|source_round_ids|rating_snapshot_ids/)
})
