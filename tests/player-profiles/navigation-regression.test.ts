import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("Main Hub artwork Player Profile target uses canonical context-aware navigation", () => {
  const navigation = read("components/navigation/ArtworkNavigation.tsx")
  const hub = read("lib/artworkPageMaps.ts")
  assert.match(navigation, /target\.id === "player-profiles"/)
  assert.match(hub, /id: "player-profiles"[\s\S]*href: "\/players"/)
})

test("dashboard and public profile controls preserve own-profile and directory behavior", () => {
  assert.match(read("app/dashboard/page.tsx"), /PlayerProfileNavLink[\s\S]*Player Profile/)
  assert.match(read("app/player-dashboard/PlayerDashboardClient.tsx"), /PlayerProfileNavLink[\s\S]*Player Profile/)
  assert.match(read("app/players/[id]/page.tsx"), /PlayerProfileNavLink currentPlayerId=\{player\.id\}/)
  assert.match(read("components/PlayerProfileNavLink.tsx"), /\/players\?browse=1/)
})

test("navigation does not resolve a player from screen-name or private identity text", () => {
  const component = read("components/PlayerProfileNavLink.tsx")
  assert.match(component, /current_user_canonical_player_id/)
  assert.doesNotMatch(component, /screen_name|display_name|email|discord/i)
})
