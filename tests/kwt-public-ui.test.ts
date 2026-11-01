import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("KWT hub uses the approved artwork and preserves public card destinations", () => {
  const page = read("app/kwt/page.tsx")
  const map = read("lib/artworkPageMaps.ts")
  assert.match(map, /kwt-hub-approved\.jpg/)
  assert.match(page, /ArtworkNavigation/)
  assert.match(page, /kwtArtwork/)
  assert.match(page, /href="\/"/)
  assert.match(map, /href: "\/champions\?league=kwt"/)
  assert.match(map, /href: "\/records"/)
  for (const label of ["Current Tournament", "Upcoming Events", "Past Champions", "Records"]) {
    assert.match(map, new RegExp(label))
  }
})

test("KWT Past Champions scopes the Hall while the default Hall remains full", () => {
  const champions = read("app/champions/page.tsx")
  const mainHub = read("lib/artworkPageMaps.ts")
  assert.match(champions, /useSearchParams/)
  assert.match(champions, /eq\("league_type", "kwt"\)/)
  assert.match(champions, /href=\{kwtOnly \? "\/kwt" : "\/"\}/)
  assert.match(champions, /kwtOnly \? "🏆 KWT Hall of Champions" : "🏆 Hall of Champions"/)
  assert.match(mainHub, /\{ id: "hall-of-champions", label: "Hall of Champions", href: "\/champions"/)
})
