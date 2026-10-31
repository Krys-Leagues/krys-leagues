import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { ownProfilePath, playerProfileNavigationPath, shouldAutoOpenOwnProfile } from "./playerProfilesRouting.ts"

test("hub Player Profiles opens the canonical signed-in profile unless browse mode is requested", () => {
  assert.equal(shouldAutoOpenOwnProfile(""), true)
  assert.equal(shouldAutoOpenOwnProfile("?browse=1"), false)
  assert.equal(ownProfilePath("canonical-player-id"), "/players/canonical-player-id")
  assert.equal(ownProfilePath(null), null)
})

test("Player Profile navigation returns the viewer's own profile from other pages", () => {
  assert.equal(playerProfileNavigationPath(undefined, "canonical-player-id"), "/players/canonical-player-id")
  assert.equal(playerProfileNavigationPath("other-player-id", "canonical-player-id"), "/players/canonical-player-id")
})

test("clicking Player Profile while viewing the owner's profile opens the directory", () => {
  assert.equal(playerProfileNavigationPath("canonical-player-id", "canonical-player-id"), "/players?browse=1")
  assert.equal(playerProfileNavigationPath("canonical-player-id", null), null)
})

test("Player Profiles routing uses only the canonical player resolver", () => {
  const hub = readFileSync("app/players/page.tsx", "utf8")
  const profile = readFileSync("app/players/[id]/page.tsx", "utf8")
  const nav = readFileSync("components/PlayerProfileNavLink.tsx", "utf8")
  assert.match(hub, /current_user_canonical_player_id/)
  assert.match(hub, /router\.replace\(path\)/)
  assert.match(profile, /PlayerProfileNavLink currentPlayerId=\{player\.id\}/)
  assert.match(nav, /current_user_canonical_player_id/)
  assert.doesNotMatch(nav, /screen_name|display_name|email/)
  assert.doesNotMatch(hub, /auth\.uid|email|display_name|discord_id|discord_username/i)
})
