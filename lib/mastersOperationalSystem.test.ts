import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("one official Masters rules source feeds the page and gateway", () => {
  const rules = read("lib/mastersRules.ts")
  const page = read("app/majors/[slug]/page.tsx")
  const gateway = read("components/home/MastersRoomReminder.tsx")
  assert.match(rules, /BE READY ON TIME/)
  assert.match(rules, /ALL PLAYERS MUST ENTER THEIR OWN SCORES WITHIN 3 HOURS OF PLAY/)
  assert.match(page, /MastersOfficialRules/)
  assert.match(gateway, /MastersOfficialRules/)
  assert.doesNotMatch(`${page}\n${gateway}`, /TOP 50%|CUT LINE|QUALIFYING ROUND|SECONDARY TROPHY/i)
})

test("Contact Admin is entrant-protected, rate-limited, audited, and truthfully delivered", () => {
  const route = read("app/api/majors/contact-admin/route.ts")
  const migration = read("supabase/migrations/20260930230000_masters_operational_admin_help.sql")
  assert.match(route, /createServerSupabaseClient/)
  assert.match(route, /create_my_masters_admin_help_request/)
  assert.match(route, /discord\.ok/)
  assert.match(route, /delivery_status: "sent"/)
  assert.match(route, /delivery_status: "failed"/)
  assert.match(route, /Player local display/)
  assert.match(migration, /current_major_player_id\(\)/)
  assert.match(migration, /entry\.status in \('registered', 'confirmed'\)/)
  assert.match(migration, /interval '10 minutes'/)
  assert.match(migration, /ANOTHER ROOM|other_room/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /force row level security/)
  assert.match(migration, /set search_path to ''/)
  assert.match(migration, /'local_display_time'/)
})

test("Masters verification is grouped round to room with shared proof and per-player actions", () => {
  const desk = read("app/admin/majors/verification/page.tsx")
  const alert = read("components/admin/MastersVerificationPendingAlert.tsx")
  assert.match(desk, /groupVerificationRooms/)
  assert.match(desk, /ROOM SCORECARD/)
  assert.match(desk, /ScorecardZoomControls/)
  assert.match(desk, /VERIFY SCORE/)
  assert.match(desk, /NEEDS CORRECTION/)
  assert.match(desk, /verify_major_scorecard/)
  assert.match(desk, /reopen_major_scorecard/)
  assert.match(alert, /MASTERS SCORES WAITING/)
  assert.match(alert, /\/admin\/majors\/verification/)
})

test("homepage and gateway share the one public Masters tracker", () => {
  const home = read("app/page.tsx")
  const gateway = read("components/home/MastersRoomReminder.tsx")
  assert.match(home, />\s*MASTERS LIVE SCORE TRACKER\s*</)
  assert.match(home, /href="\/majors\/masters\/results"/)
  assert.match(gateway, /href="\/majors\/masters\/results"/)
})
