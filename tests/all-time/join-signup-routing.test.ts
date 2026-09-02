import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("Join Leagues provides a visible keyboard-accessible route back to the approved Main Hub", () => {
  const join = read("app/join/page.tsx")

  const map = read("lib/artworkPageMaps.ts")
  assert.match(join, /ArtworkNavigation/)
  assert.match(map, /id: "back-to-krys-leagues", label: "Back to Krys Leagues", href: "\/"/)
})

test("every visible Join Leagues card maps to its intended registration experience", () => {
  const map = read("lib/artworkPageMaps.ts")
  const links = [...map.matchAll(/\{ id: "([^"]+)", label: "([^"]+)", href: "(\/register\?league=[^"]+)"/g)].map((match) => [match[2], match[3]])

  assert.deepEqual(links, [
    ["Join Match Play League", "/register?league=match"],
    ["Join Stroke League", "/register?league=stroke"],
    ["Join Pick Your Poison", "/register?league=pyp"],
    ["Join Doubles League", "/register?league=doubles"],
    ["Join Pro League", "/register?league=pro"],
    ["Join Bracket / Cup Players", "/register?league=cups"],
    ["Join Community, Records, and Leaderboards", "/register?league=community"],
  ])
})

test("Bracket / Cup Players uses the protected cups registration route and never Match Play artwork", () => {
  const join = read("lib/artworkPageMaps.ts")
  const register = read("app/register/page.tsx")
  const cupsConfig = register.match(/cups: \{([^}]*)\}/)?.[1] || ""

  assert.match(join, /label: "Join Bracket \/ Cup Players", href: "\/register\?league=cups"/)
  assert.match(cupsConfig, /title: "Bracket \/ Cup Registration"/)
  assert.match(cupsConfig, /image: null/)
  assert.doesNotMatch(cupsConfig, /match\.png/)
  assert.match(register, /data-registration-experience="bracket-cup"/)
  assert.match(register, /player_waitlist/)
  assert.match(register, /league_type: leagueKey/)
  assert.match(register, /isDuplicateWaitlistError/)
})

test("Bracket / Cup registration returns to Join Leagues", () => {
  const register = read("app/register/page.tsx")
  assert.match(register, /href="\/join"[\s\S]*?Back to League Selection/)
})
