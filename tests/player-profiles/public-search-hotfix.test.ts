import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("public Player Profiles uses a public-safe server reader instead of browser table access", () => {
  const page = read("app/players/page.tsx")
  const route = read("app/api/players/public-search/route.ts")
  const reader = read("lib/publicProfiles/server.ts")

  assert.match(page, /fetch\(`\/api\/players\/public-search/)
  assert.doesNotMatch(page, /\.from\("players"\)|loadCanonicalPublicPlayers/)
  assert.match(route, /loadPublicProfileSearch/)
  assert.match(reader, /createClient\(url, key/)
  assert.match(reader, /get_public_player_canonical_identity/)
  assert.match(reader, /buildCanonicalPublicPlayerChoices/)
  assert.doesNotMatch(route, /admin|authorizeSiteAdmin/)
})

test("public search returns only discovery-safe fields and preserves canonical IDs", () => {
  const reader = read("lib/publicProfiles/server.ts")
  assert.match(reader, /id: string/)
  assert.match(reader, /screen_name: string/)
  assert.match(reader, /avatar_path/)
  assert.doesNotMatch(reader, /\.select\([^)]*profile_badges/)
  assert.doesNotMatch(reader, /discord_id|discord_name|discord_username|email|auth_id|admin_notes/)
  assert.match(reader, /id: player\.id/)
})

test("public directory keeps clean loading, no-match, and error states", () => {
  const page = read("app/players/page.tsx")
  assert.match(page, /Loading player profiles/)
  assert.match(page, /No players match that search/)
  assert.match(page, /Player profiles are temporarily unavailable/)
  assert.match(page, /href=\{`\/players\/\$\{player\.id\}`\}/)
})

test("profile features remain wired while directory reader changes", () => {
  const profile = read("app/players/[id]/page.tsx")
  assert.match(profile, /courseChallengeRewardsResponse/)
  assert.match(profile, /trophiesResponse/)
  assert.match(profile, /strokeHistoryResponse/)
  assert.match(profile, /monthlyHistoryResponse/)
  assert.match(profile, /Course Challenge Sticker Showcase/)
})
