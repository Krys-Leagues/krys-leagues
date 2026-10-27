import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("Main Hub artwork Player Profile target opens the public directory", () => {
  const navigation = read("components/navigation/ArtworkNavigation.tsx")
  const hub = read("lib/artworkPageMaps.ts")
  assert.match(navigation, /target\.id === "player-profiles" && definition\.id !== "main-hub"/)
  assert.match(hub, /id: "player-profiles"[\s\S]*href: "\/players"/)
  assert.match(read("app/players/page.tsx"), /ArtworkNavigation/)
  assert.doesNotMatch(read("app/players/page.tsx"), /router\.replace\(path\)/)
})

test("dashboard and public profile controls preserve own-profile and directory behavior", () => {
  assert.match(read("app/dashboard/page.tsx"), /redirect\("\/player-dashboard"\)/)
  assert.match(read("app/player-dashboard/PlayerDashboardClient.tsx"), /PlayerProfileNavLink[\s\S]*Player Profile/)
  assert.match(read("app/players/[id]/page.tsx"), /PlayerProfileNavLink currentPlayerId=\{player\.id\}/)
  assert.match(read("components/PlayerProfileNavLink.tsx"), /\/players\?browse=1/)
})

test("navigation does not resolve a player from screen-name or private identity text", () => {
  const component = read("components/PlayerProfileNavLink.tsx")
  assert.match(component, /current_user_canonical_player_id/)
  assert.doesNotMatch(component, /screen_name|display_name|email|discord/i)
})

test("signed-in players get a separate floating canonical-profile control", () => {
  const layout = read("app/layout.tsx")
  const control = read("components/PlayerProfileFloatingControl.tsx")
  const styles = read("components/PlayerProfileFloatingControl.module.css")
  assert.match(layout, /PlayerProfileFloatingControl/)
  assert.match(control, /current_user_canonical_player_id/)
  assert.match(control, /href=\{`\/players\/\$\{encodeURIComponent\(player\.id\)\}`\}/)
  assert.match(control, /data-tour="my-profile-shortcut"/)
  assert.match(styles, /position: fixed/)
  assert.match(styles, /border-radius: 50%/)
})
