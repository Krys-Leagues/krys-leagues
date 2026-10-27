import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("no-current Match hub state offers the normal season creation route", async () => {
  const page = await readFile("app/admin/match/page.tsx", "utf8")

  assert.match(page, /!managedSeason/)
  assert.match(page, /NO CURRENT MATCH SEASON/)
  assert.match(page, /CREATE NEW MATCH SEASON/)
  assert.match(page, /href="\/admin\/match\/season"/)
})

test("Match creation keeps the existing authorized RPC and setup handoff", async () => {
  const page = await readFile("app/admin/match/season/page.tsx", "utf8")

  assert.match(page, /rpc\("create_match_season_with_roster"/)
  assert.match(page, /p_season_number: number/)
  assert.match(page, /p_division_count: count/)
  assert.match(page, /p_start_date: startDate/)
  assert.match(page, /p_end_date: endDate/)
  assert.match(page, /roster_version_id/)
  assert.match(page, /\/admin\/match\/setup\?\$\{setupParams\.toString\(\)\}/)
})

test("Match creation remains behind the normal admin authorization gate", async () => {
  const [layout, proxy] = await Promise.all([
    readFile("app/admin/layout.tsx", "utf8"),
    readFile("proxy.ts", "utf8"),
  ])

  assert.match(layout, /\/api\/auth\/admin-authorization/)
  assert.match(proxy, /is_current_user_site_admin/)
  assert.doesNotMatch(layout, /Dawn|Spicy/)
})

test("Match hub creation does not alter the course-wheel route or flow", async () => {
  const [hub, setup] = await Promise.all([
    readFile("app/admin/match/page.tsx", "utf8"),
    readFile("app/admin/match/setup/page.tsx", "utf8"),
  ])

  assert.doesNotMatch(hub, /course-wheel/)
  assert.match(setup, /\/api\/admin\/match\/course-wheel/)
  assert.match(setup, /spinCourseWheel/)
  assert.match(setup, /MATCH_GAME_DIFFICULTIES/)
})
