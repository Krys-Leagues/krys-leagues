import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("public Player Profiles keeps the canonical search and profile routes", () => {
  const page = read("app/players/page.tsx")
  const profile = read("app/players/[id]/page.tsx")
  const artworkMap = read("lib/artworkPageMaps.ts")
  const styles = read("app/players/page.module.css")

  assert.match(page, /ArtworkNavigation/)
  assert.match(page, /playerProfilesArtwork/)
  assert.match(page, /loadCanonicalPublicPlayers/)
  assert.match(page, /player\.screen_name\.toLowerCase\(\)\.includes\(query\)/)
  assert.match(page, /href=\{`\/players\/\$\{player\.id\}`\}/)
  assert.match(page, /event\.key === "ArrowDown"/)
  assert.match(page, /event\.key === "ArrowUp"/)
  assert.match(page, /event\.key === "Enter"/)
  assert.match(page, /event\.key === "Escape"/)
  assert.match(page, /href="\/"[\s\S]*Back to Krys Leagues/)
  assert.match(page, /onFocus=\{\(\) => setResultsOpen\(true\)\}/)
  assert.match(page, /filteredPlayers\.length \? filteredPlayers\.map/)
  assert.match(page, /aria-controls="player-profile-search-results"/)
  assert.match(styles, /\.searchRegion:focus-within::after/)
  assert.match(page, /className=\{styles\.backButton\}/)
  assert.doesNotMatch(page, /className=\{`artwork-navigation__back-link/)
  assert.doesNotMatch(page, /No active players found|style=\{directory\}/)
  assert.match(artworkMap, /player-profiles-approved\.jpg/)
  assert.match(profile, /router\.replace\(`\/players\/\$\{canonicalId\}`\)/)
})
