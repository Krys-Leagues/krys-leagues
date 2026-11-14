import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const page = await readFile(new URL("../../app/admin/tournaments/bracket/page.tsx", import.meta.url), "utf8")
const client = await readFile(new URL("../../app/admin/tournaments/bracket/BracketAdminClient.tsx", import.meta.url), "utf8")
const route = await readFile(new URL("../../app/api/admin/tournaments/result/route.ts", import.meta.url), "utf8")
const hub = await readFile(new URL("../../app/admin/krys-tourney/page.tsx", import.meta.url), "utf8")

test("Area 15 admin reads the existing tournament contract", () => {
  assert.match(page, /trustedTournamentClient\(\)/u)
  assert.match(page, /eq\("slug", TOURNAMENT_SLUG\)/u)
  assert.match(page, /from\("tournament_matches"\)/u)
  assert.match(page, /from\("tournament_winner_confirmations"\)/u)
  assert.match(page, /from\("tournament_match_results"\)/u)
})

test("Area 15 admin shows completed matches and pending confirmations", () => {
  assert.match(client, /Completed/u)
  assert.match(client, /Pending \/ active/u)
  assert.match(client, /confirmations.map/u)
  assert.match(client, /Record verified result/u)
})

test("Area 15 writes use authenticated audited RPCs only", () => {
  assert.match(route, /authorizeSiteAdminMutation\(\)/u)
  assert.match(route, /admin_record_tournament_match_result/u)
  assert.match(route, /admin_force_tournament_advance/u)
  assert.doesNotMatch(route, /from\("tournament_matches"\).*\.update/u)
  assert.doesNotMatch(route, /from\("tournament_match_results"\).*\.insert/u)
})

test("Area 15 is linked from the existing tournament admin hub", () => {
  assert.match(hub, /href="\/admin\/tournaments\/bracket"/u)
})
