import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync(new URL("../supabase/migrations/20261003120000_doubles_match_play_current.sql", import.meta.url), "utf8")
const schedule = fs.readFileSync(new URL("../app/api/admin/doubles/schedule/route.ts", import.meta.url), "utf8")
const review = fs.readFileSync(new URL("../app/api/admin/doubles/review/route.ts", import.meta.url), "utf8")
const live = fs.readFileSync(new URL("../app/api/doubles/live/route.ts", import.meta.url), "utf8")
const profile = fs.readFileSync(new URL("../app/api/doubles/teams/[teamId]/route.ts", import.meta.url), "utf8")
const teamsAdmin = fs.readFileSync(new URL("../app/admin/doubles/teams/page.tsx", import.meta.url), "utf8")
const scheduleAdmin = fs.readFileSync(new URL("../app/admin/doubles/schedule/page.tsx", import.meta.url), "utf8")

test("current Doubles generation is team-scoped and publication-aware", () => {
  assert.match(migration, /doubles_managed_fixtures[\s\S]*published_at timestamptz/)
  assert.match(migration, /doubles_team_course_drafts/)
  assert.match(migration, /course_slot text[^\n]*HOME_TEAM_COURSE/)
  assert.match(migration, /doubles_course_evidence/)
  assert.match(migration, /doubles_discord_event_outbox/)
  assert.match(migration, /public\.doubles_course_evidence[\s\S]*from anon, authenticated/)
  assert.match(migration, /get_public_doubles_team_profile/)
})

test("publication is an explicit admin action and public live reads only published fixtures", () => {
  assert.match(schedule, /publish_fixture/)
  assert.match(schedule, /Both teams must have two active season members/)
  assert.match(live, /not\("published_at", "is", null\)/)
  assert.doesNotMatch(live, /storage_path|evidence_storage_path/)
})

test("normal verification is gated while explicit overrides remain audited", () => {
  assert.match(review, /Both teams must submit both complete course slots/)
  assert.match(review, /Both private course evidence uploads are required/)
  assert.match(review, /Submitted team totals disagree/)
  assert.match(review, /An explicit reason is required for an override/)
  assert.match(review, /save_doubles_result/)
})

test("public team profiles use the narrow anonymous-safe reader and admin screens avoid legacy writes", () => {
  assert.match(profile, /createServerSupabaseClient/)
  assert.doesNotMatch(profile, /createDoublesRuntimeClient|SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(teamsAdmin, /from\("doubles_teams"\)/)
  assert.doesNotMatch(scheduleAdmin, /from\("schedule"\)/)
  assert.match(scheduleAdmin, /home_course/)
  assert.match(scheduleAdmin, /away_course/)
})
