import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("Player Dashboard is linked only from the signed-in player's own profile", () => {
  const profile = read("app/players/[id]/page.tsx")
  const homepage = read("app/page.tsx")

  assert.match(profile, /canEditProfile && <Link href="\/player-dashboard"/)
  assert.doesNotMatch(homepage, /href="\/player-dashboard"|Player Dashboard/)
})

test("Player Dashboard reads only the authenticated canonical player's current data", () => {
  const dashboard = read("app/player-dashboard/page.tsx")

  assert.match(dashboard, /getSession\(\)/)
  assert.match(dashboard, /current_user_canonical_player_id/)
  assert.match(dashboard, /get_public_player_canonical_identity/)
  assert.match(dashboard, /from\("seasons"\).*is_active/)
  assert.match(dashboard, /player_league_memberships.*loadedIdentityIds/)
  assert.doesNotMatch(dashboard, /loadCanonicalPublicPlayers|selectedPlayerId|<select/)
})

test("Empty Dashboard provides Join Leagues and active schedules stay authoritative", () => {
  const dashboard = read("app/player-dashboard/page.tsx")

  assert.match(dashboard, /No current league participation/)
  assert.match(dashboard, /href="\/join"/)
  assert.match(dashboard, /samePair/)
  assert.match(dashboard, /Scheduled games/)
  assert.match(dashboard, /opponentName &&/)
  assert.doesNotMatch(dashboard, /post-schedule|discord.*channel|role.*sync/i)
})
