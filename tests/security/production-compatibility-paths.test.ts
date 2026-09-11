import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const source = (path: string) => readFileSync(path, "utf8")
const records = [
  "app/admin/records/entry/page.tsx",
  "app/admin/records/single/page.tsx",
  "app/admin/records/history/page.tsx",
  "app/admin/records/backfill/page.tsx",
]

test("All-Time and Climbers admin reads use the protected route", () => {
  for (const path of records) {
    const text = source(path)
    assert.doesNotMatch(text, /supabase\.from\("(?:all_time_courses|all_time_best_records|all_time_record_observations|all_time_late_backfill_audit|climbers_seasons)"\)/)
    assert.match(text, /\/api\/admin\/records\/all-time\?view=/)
  }
  const route = source("app/api/admin/records/all-time/route.ts")
  assert.match(route, /authorizeSiteAdminMutation/)
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY \|\| process\.env\.SUPABASE_SECRET_KEY/)
})

test("combined records use the protected admin mutation path", () => {
  const page = source("app/admin/records/combined/page.tsx")
  assert.doesNotMatch(page, /supabase\.from\("combined_course_records"\)/)
  assert.match(page, /\/api\/admin\/records\/combined/)
  const route = source("app/api/admin/records/combined/route.ts")
  assert.match(route, /export async function POST/)
  assert.match(route, /authorizeSiteAdminMutation/)
})

test("player registration writes and reads use the protected admin path", () => {
  const page = source("app/admin/players/page.tsx")
  assert.doesNotMatch(page, /supabase\.from\("player_(?:league_memberships|tournament_entries)"\)/)
  assert.match(page, /\/api\/admin\/players/)
  const route = source("app/api/admin/players/route.ts")
  assert.match(route, /add_league_membership/)
  assert.match(route, /add_tournament_entry/)
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY \|\| process\.env\.SUPABASE_SECRET_KEY/)
})

test("admin schedule writes use the protected route", () => {
  for (const path of ["app/admin/doubles/schedule/page.tsx", "app/admin/pro/schedule/page.tsx", "app/admin/schedule/page.tsx"]) {
    const text = source(path)
    assert.doesNotMatch(text, /supabase\.from\("(?:seasons|schedule)"\)[\s\S]*?\.(?:insert|update|upsert|delete)/)
    assert.match(text, /\/api\/admin\/schedules/)
  }
  const route = source("app/api/admin/schedules/route.ts")
  assert.match(route, /authorizeSiteAdminMutation/)
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY \|\| process\.env\.SUPABASE_SECRET_KEY/)
})

test("public schedule deletion remains explicitly flagged for follow-up auth review", () => {
  assert.match(source("app/schedule/page.tsx"), /\.from\("schedule"\)[\s\S]*?\.delete\(\)/)
})
