import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const route = readFileSync(new URL("../../app/api/monthlies/public/route.ts", import.meta.url), "utf8")
const page = readFileSync(new URL("../../app/monthlies/page.tsx", import.meta.url), "utf8")
const profile = readFileSync(new URL("../../app/players/[id]/page.tsx", import.meta.url), "utf8")

test("public Monthly endpoint uses a server-only client and a constrained public projection", () => {
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/)
  assert.match(route, /historical_monthly_score_observations/)
  assert.match(route, /player:players\(screen_name\)/)
  assert.match(route, /availablePeriods/)
  assert.match(route, /period_year.*period_month.*division/)
  assert.match(route, /selectedPeriod/)
  assert.match(route, /selectedDivision/)
  assert.doesNotMatch(route, /historical_player_name|source_player_id|source_url|raw_source|source_sha256|historical_monthly_import_id/)
  assert.match(route, /canonicalPlayerId/)
})

test("public Monthly results use a focused period view with standings and map cards", () => {
  assert.match(page, /MONTHLY RESULTS/)
  assert.match(page, />Year/)
  assert.match(page, />Month/)
  assert.match(page, />Division/)
  assert.match(page, /Overall standings/)
  assert.match(page, /Monthly overall standings/)
  assert.match(page, /Maps and course placements/)
  assert.match(page, /DifficultyTable/)
  assert.match(page, /Previous Month/)
  assert.doesNotMatch(page, /All completed Monthly results/)
  assert.match(page, /current and incomplete periods are excluded/i)
})

test("Player Profile loads Monthly history through the public canonical-player endpoint", () => {
  assert.match(profile, /\/api\/monthlies\/public\?playerId=/)
  assert.match(profile, /canonicalPlayerId/)
  assert.match(profile, /MonthlyPeriodCard/)
  assert.match(profile, /View Course Scores/)
  assert.match(profile, /overallPlacement/)
})
