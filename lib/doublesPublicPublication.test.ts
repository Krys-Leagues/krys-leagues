import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const page = fs.readFileSync(new URL("../app/doubles/page.tsx", import.meta.url), "utf8")
const live = fs.readFileSync(new URL("../app/api/doubles/live/route.ts", import.meta.url), "utf8")
const component = fs.readFileSync(new URL("../app/league-play/DoublesLiveScoring.tsx", import.meta.url), "utf8")
const history = fs.readFileSync(new URL("../app/doubles-standings/page.tsx", import.meta.url), "utf8")

test("public Doubles uses the publication-gated managed reader", () => {
  assert.match(page, /DoublesLiveScoring/)
  assert.doesNotMatch(page, /PublicLeagueBoard kind=\"doubles\"/)
  assert.match(live, /from\("doubles_managed_fixtures"\)/)
  assert.match(live, /not\("published_at", "is", null\)/)
  assert.match(live, /in\("status", \["SCHEDULED", "LIVE", "COMPLETED"\]\)/)
  assert.match(live, /if \(fixtures\.error\)/)
  assert.match(live, /status: 503/)
  assert.doesNotMatch(live, /from\("schedule"\)|from\("results"\)/)
})

test("empty public Doubles state is honest and read-only", () => {
  assert.match(component, /No published Doubles fixtures are available\./)
  assert.match(component, /Read-only public view/)
  assert.doesNotMatch(component, /<button|fetch\([^)]*,\s*\{[^}]*method:\s*["'](POST|PUT|PATCH|DELETE)/i)
  assert.doesNotMatch(component, /Season 203|DOUBLES_TEST_/)
  assert.match(component, /Live scoring unavailable/)
  assert.match(component, /flexWrap: "wrap"/)
})

test("published completed fixtures expose verified results without public mutation controls", () => {
  assert.match(live, /const resultByFixture = new Map/)
  assert.match(live, /result \? "VERIFIED"/)
  assert.match(live, /if \(drafts\.error \|\| results\.error\)/)
  assert.match(component, /fixture\.result \? `\$\{fixture\.result\.home_holes_won\}–\$\{fixture\.result\.away_holes_won\}` : fixture\.state/)
  assert.doesNotMatch(component, /onClick|method:\s*["'](POST|PUT|PATCH|DELETE)/i)
})

test("historical Doubles standings remain on their dedicated reader", () => {
  assert.match(history, /doubles_historical_public_standings/)
  assert.match(history, /Historical Doubles/)
  assert.doesNotMatch(history, /doubles_managed_fixtures/)
})
