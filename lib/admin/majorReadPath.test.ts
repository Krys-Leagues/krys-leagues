import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const root = process.cwd()
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8")

const clientPages = [
  "app/admin/majors/page.tsx",
  "app/admin/majors/scheduling/page.tsx",
  "app/admin/majors/scoring/page.tsx",
  "app/admin/majors/verification/page.tsx",
  "app/majors/page.tsx",
  "app/majors/[slug]/page.tsx",
  "app/majors/[slug]/results/page.tsx",
  "app/majors/[slug]/stats/page.tsx",
  "app/majors/[slug]/scoring/page.tsx",
]

const targetTables = [
  "major_entry_day_choices",
  "major_schedule_groups",
  "major_entry_weekend_status",
  "major_schedule_group_members",
  "major_time_slots",
  "major_scoring_participants",
  "major_scoring_sessions",
  "major_standard_signup_times",
  "major_events",
  "major_entries",
  "major_final_placements",
  "major_play_days",
  "major_hole_scores",
]

test("Major client pages do not directly query protected base tables", () => {
  for (const path of clientPages) {
    const source = read(path)
    for (const table of targetTables) {
      assert.doesNotMatch(source, new RegExp(`from\\(\\s*["']${table}["']`), `${path} directly queries ${table}`)
    }
  }
})

test("Major admin data route is site-admin protected and trusted-server backed", () => {
  const source = read("app/api/admin/majors/data/route.ts")
  assert.match(source, /authorizeSiteAdminMutation\(\)/)
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(source, /createClient\(/)
})

test("Major public data route exposes bounded fields and no player identity key", () => {
  const source = read("app/api/majors/data/route.ts")
  assert.match(source, /PUBLIC_EVENT_FIELDS/)
  assert.match(source, /player_screen_name_snapshot/)
  assert.doesNotMatch(source, /select\("id,major_event_id,player_id,player_screen_name_snapshot/)
})

test("Protected Major mutation RPCs remain in the client workflows", () => {
  const admin = read("app/admin/majors/page.tsx")
  const scheduling = read("app/admin/majors/scheduling/page.tsx")
  const scoring = read("app/admin/majors/scoring/page.tsx")
  assert.match(admin, /save_major_event/)
  assert.match(admin, /admin_register_major_player/)
  assert.match(scheduling, /admin_set_major_day_choice/)
  assert.match(scoring, /save_major_hole_scores/)
})
