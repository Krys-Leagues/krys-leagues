import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("every visible Join Leagues card maps to its intended registration experience", () => {
  const join = read("app/join/page.tsx")
  const links = [...join.matchAll(/title: "([^"]+)",[\s\S]*?link: "(\/register\?league=[^"]+)"/g)].map((match) => [match[1], match[2]])

  assert.deepEqual(links, [
    ["Match Play League", "/register?league=match"],
    ["Stroke League", "/register?league=stroke"],
    ["Pick Your Poison", "/register?league=pyp"],
    ["Doubles League", "/register?league=doubles"],
    ["Pro League", "/register?league=pro"],
    ["Bracket / Cup Players", "/register?league=cups"],
    ["Community / Records / Leaderboards", "/register?league=community"],
  ])
})

test("Bracket / Cup Players uses the protected cups registration route and never Match Play artwork", () => {
  const join = read("app/join/page.tsx")
  const register = read("app/register/page.tsx")
  const cupsConfig = register.match(/cups: \{([^}]*)\}/)?.[1] || ""

  assert.match(join, /title: "Bracket \/ Cup Players",[\s\S]*?link: "\/register\?league=cups"/)
  assert.match(cupsConfig, /title: "Bracket \/ Cup Registration"/)
  assert.match(cupsConfig, /image: null/)
  assert.doesNotMatch(cupsConfig, /match\.png/)
  assert.match(register, /data-registration-experience="bracket-cup"/)
  assert.match(register, /player_waitlist/)
  assert.match(register, /league_type: leagueKey/)
})

test("Bracket / Cup registration returns to Join Leagues", () => {
  const register = read("app/register/page.tsx")
  assert.match(register, /href="\/join"[\s\S]*?Back to League Selection/)
})
