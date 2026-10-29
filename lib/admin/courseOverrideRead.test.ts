import { readFile } from "node:fs/promises"
import { test } from "node:test"
import assert from "node:assert/strict"

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8")
}

test("Match and Stroke course override reads use protected server routes", async () => {
  const [matchSetup, matchSchedule, strokeSetup, strokeSchedule, helper, matchRoute, strokeRoute] =
    await Promise.all([
      source("app/admin/match/setup/page.tsx"),
      source("app/admin/match/schedule/page.tsx"),
      source("app/admin/stroke/setup/page.tsx"),
      source("app/admin/stroke/schedule/page.tsx"),
      source("lib/admin/courseOverrideRead.ts"),
      source("app/api/admin/match/division-course-overrides/route.ts"),
      source("app/api/admin/stroke/division-course-overrides/route.ts"),
    ])

  assert.match(matchSetup, /fetchAdminDivisionCourseOverrides\(\s*"match"/)
  assert.match(matchSchedule, /fetchAdminDivisionCourseOverrides\(\s*"match"/)
  assert.match(strokeSetup, /fetchAdminDivisionCourseOverrides\(\s*"stroke"/)
  assert.match(strokeSchedule, /fetchAdminDivisionCourseOverrides\(\s*"stroke"/)

  assert.doesNotMatch(matchSetup, /from\(["']match_division_course_overrides["']\)/)
  assert.doesNotMatch(matchSchedule, /from\(["']match_division_course_overrides["']\)/)
  assert.doesNotMatch(strokeSetup, /from\(["']stroke_division_course_overrides["']\)/)
  assert.doesNotMatch(strokeSchedule, /from\(["']stroke_division_course_overrides["']\)/)

  assert.match(helper, /\/api\/admin\/\$\{league\}\/division-course-overrides/)
  assert.match(matchRoute, /authorizeSiteAdminMutation/)
  assert.match(strokeRoute, /authorizeSiteAdminMutation/)
  assert.match(matchRoute, /SUPABASE_SERVICE_ROLE_KEY\s+\|\|\s+process\.env\.SUPABASE_SECRET_KEY/)
  assert.match(strokeRoute, /SUPABASE_SERVICE_ROLE_KEY\s+\|\|\s+process\.env\.SUPABASE_SECRET_KEY/)
  assert.match(matchRoute, /from\("match_division_course_overrides"\)/)
  assert.match(strokeRoute, /from\("stroke_division_course_overrides"\)/)

  assert.match(matchSetup, /rpc\("set_match_division_course_overrides"/)
  assert.match(strokeSetup, /rpc\("set_stroke_division_course_overrides"/)
})
