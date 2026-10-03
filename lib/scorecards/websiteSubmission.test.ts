import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")

test("one permanent player route exposes only PYP, Stroke, and Match without polling", () => {
  const page = read("components/scorecards/PlayerScorecardSubmission.tsx")
  const upload = read("app/api/scorecards/upload/route.ts")
  assert.match(page, /SUBMIT YOUR SCORECARD/)
  for (const league of ["pyp", "stroke", "match"]) assert.match(page, new RegExp(league))
  assert.doesNotMatch(page, /doubles/i)
  assert.doesNotMatch(page, /setInterval|setTimeout|onAuthStateChange/)
  assert.match(upload, /createServerSupabaseClient/)
  assert.doesNotMatch(`${page}\n${upload}`, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/)
})

test("server resolves canonical identity and exact contexts for PYP, Stroke, and Match", () => {
  const server = read("lib/scorecards/server.ts")
  for (const resolver of ["resolvePypScorecardContext", "resolveStrokeScorecardContext", "resolveMatchScorecardContext"]) assert.match(server, new RegExp(resolver))
  assert.match(server, /loadWebsiteScorecardContexts/)
  assert.doesNotMatch(server, /doublesPlayerIsMember|resolveDoublesScorecardContext/)
  assert.match(server, /shared_scorecard_evidence/)
  assert.match(server, /already_submitted/)
})

test("authoritative review keeps league writers and private evidence idempotent", () => {
  const admin = read("lib/scorecards/adminServer.ts")
  const match = read("lib/scorecards/adapters/match.ts")
  assert.match(admin, /matchScorecardAdapter/)
  assert.match(match, /save_match_result/)
  assert.match(match, /Holes Won/i)
  assert.doesNotMatch(admin, /doublesScorecardAdapter/)
})

test("Doubles is not exposed by the release", () => {
  const upload = read("app/api/scorecards/upload/route.ts")
  const catalog = read("lib/scorecards/adapters/catalog.ts")
  assert.doesNotMatch(upload, /doubles/i)
  assert.match(catalog, /key: "doubles", status: "blocked"/)
})
