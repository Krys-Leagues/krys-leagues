import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "..")
const migration = readFileSync(resolve(root, "supabase/migrations/20261007120000_match_course_wheel.sql"), "utf8")
const route = readFileSync(resolve(root, "app/api/admin/match/course-wheel/route.ts"), "utf8")
const setupPage = readFileSync(resolve(root, "app/admin/match/setup/page.tsx"), "utf8")

test("Match wheel persistence is keyed by season, division, and game", () => {
  assert.match(migration, /unique \(season_id, division_number, game_number\)/)
  assert.match(migration, /match_course_wheel_selections/)
  assert.match(migration, /if found then[\s\S]*?v_existing\.options[\s\S]*?true/)
  assert.match(migration, /protect_match_course_wheel_override/)
  assert.match(migration, /cannot be cleared or replaced/)
})

test("Match wheel uses the existing course override path and does not touch results or standings", () => {
  assert.match(migration, /match_division_course_overrides/)
  assert.match(migration, /change_revision = change_revision \+ 1/)
  assert.doesNotMatch(migration, /insert into public\.(results|season_standings|season_results|matches)/i)
  assert.doesNotMatch(migration, /rebuild_match_standings|save_match_result/i)
})

test("admin wheel route is server-authorized and uncached", () => {
  assert.match(route, /authorizeSiteAdminMutation/)
  assert.match(route, /spin_match_course_wheel/)
  assert.match(route, /Cache-Control.*no-store/)
})

test("existing Match Setup is the wheel home", () => {
  assert.match(setupPage, /Course Wheel/)
  assert.match(setupPage, /spinCourseWheel/)
  assert.match(setupPage, /MATCH_GAME_DIFFICULTIES/)
})
