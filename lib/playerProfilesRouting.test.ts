import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { ownProfilePath, shouldAutoOpenOwnProfile } from "./playerProfilesRouting.ts"

test("hub Player Profiles opens the canonical signed-in profile unless browse mode is requested", () => {
  assert.equal(shouldAutoOpenOwnProfile(""), true)
  assert.equal(shouldAutoOpenOwnProfile("?browse=1"), false)
  assert.equal(ownProfilePath("canonical-player-id"), "/players/canonical-player-id")
  assert.equal(ownProfilePath(null), null)
})

test("Player Profiles routing uses only the canonical player resolver", () => {
  const hub = readFileSync("app/players/page.tsx", "utf8")
  const profile = readFileSync("app/players/[id]/page.tsx", "utf8")
  assert.match(hub, /current_user_canonical_player_id/)
  assert.match(hub, /router\.replace\(path\)/)
  assert.match(profile, /href="\/players\?browse=1"/)
  assert.doesNotMatch(hub, /auth\.uid|email|display_name|discord/i)
})