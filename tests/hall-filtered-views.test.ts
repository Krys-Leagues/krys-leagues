import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("full Hall puts Browse Trophy Categories before recent trophy groups", () => {
  const page = read("app/champions/page.tsx")

  assert.ok(page.indexOf("<HallCategoryArchives") < page.indexOf("<RecentTrophyGroups"))
  assert.match(page, /function HallCategoryArchives/)
  assert.match(page, /Browse Trophy Categories/)
  assert.match(page, /Recent Champions \/ Newest Trophy Groups/)
})

test("filtered Hall views reuse the existing Hall renderer and source", () => {
  const page = read("app/champions/page.tsx")
  const scope = read("lib/championScope.ts")

  assert.match(page, /filterTrophiesForScope/)
  assert.match(page, /FilteredHallCategory/)
  assert.match(page, /data-hall-scope=\{scope\}/)
  assert.match(scope, /champion-of-champions/)
  assert.match(scope, /krys-cup/)
  assert.match(scope, /spicy-cup/)
  assert.match(scope, /monthly/)
  assert.match(scope, /bracket/)
})

test("Invitationals opens only supported filtered Hall destinations", () => {
  const map = read("lib/artworkPageMaps.ts")
  const invitationals = read("app/invitationals/page.tsx")

  assert.match(map, /champions\?category=champion-of-champions&from=invitationals/)
  assert.match(map, /champions\?category=krys-cup&from=invitationals/)
  assert.match(map, /champions\?category=spicy-cup&from=invitationals/)
  assert.match(map, /earn-your-invite.*\/tournaments/)
  assert.doesNotMatch(map, /id: "past-winners".*href: "\/champions"/)
  assert.match(invitationals, /invitationalsArtwork/)
})

test("filtered Hall back destinations are deterministic by originating area", () => {
  const page = read("app/champions/page.tsx")

  assert.match(page, /from === "invitationals"\) return "\/invitationals"/)
  assert.match(page, /from === "monthlies"\) return "\/monthlies"/)
  assert.match(page, /from === "tournaments"\) return "\/tournaments"/)
  assert.match(page, /scope === "kwt"\) return "\/kwt"/)
})

test("Spicy Cup keeps the approved qualification wording", () => {
  const page = read("app/champions/page.tsx")

  assert.match(page, /Amateur Invitational for players who did not advance past Round 2\./)
})


test("approved Hall artwork is followed directly by Hall content", () => {
  const page = read("app/champions/page.tsx")

  assert.match(page, /hallOfChampionsArtworkAsset/)
  assert.doesNotMatch(page, /<section style=\{hero\}>/)
})
