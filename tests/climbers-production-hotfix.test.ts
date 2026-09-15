import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { formatClimbersDateRange, formatClimbersSeasonLabel } from "../lib/climbersDisplay.ts"
import { normalizePublicClimbersPayload } from "../lib/publicClimbers.ts"

const read = (path: string) => readFileSync(path, "utf8")

test("admin Climbers reads are protected server reads and preserve the stored event rows", () => {
  const page = read("app/admin/records/climbers/page.tsx")
  const route = read("app/api/admin/records/climbers/route.ts")
  const directoryRoute = read("app/api/admin/records/climbers/players/route.ts")
  assert.match(page, /fetch\("\/api\/admin\/records\/climbers"/)
  assert.doesNotMatch(page, /supabase\.from\("players"\)|supabase\.from\("climbers_events"\)|supabase\.from\("climbers_year_to_date"\)/)
  assert.match(route, /authorizeSiteAdminMutation\(\)/)
  assert.match(route, /createAdminSupabaseClient/)
  assert.match(directoryRoute, /loadAdminGlobalPlayerDirectory/)
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/)
  assert.match(route, /climbers_event_passes/)
  assert.match(route, /climbers_year_to_date/)
})

test("Climbers display uses canonical names, safe unresolved fallbacks, and wide event cards", () => {
  const page = read("app/admin/records/climbers/page.tsx")
  const css = read("components/admin/records/AdminRecordsUI.module.css")
  const review = read("app/admin/records/climbers/LegacyBaselineIdentityReview.tsx")
  assert.match(page, /resolveCanonicalPlayerDisplay/)
  assert.match(page, /styles\.eventCard/)
  assert.match(page, /styles\.passedList/)
  assert.match(css, /\.eventCard/)
  assert.match(css, /overflow-wrap:anywhere/)
  assert.doesNotMatch(page, /playerMap\.get\(playerId\) \?\? playerId/)
  assert.match(review, /baselineActive/)
  assert.match(review, /already active/)
  assert.match(review, /does not reactivate or replay/)
})

test("date labels repair stored mojibake without changing stored timestamps", () => {
  assert.equal(formatClimbersSeasonLabel("Aug 29â€“Sep 11, 2026"), "Aug 29–Sep 11, 2026")
  assert.equal(formatClimbersDateRange("2026-08-29T00:00:00Z", "2026-09-12T00:00:00Z"), "Aug 29, 2026 – Sep 11, 2026")
})

test("public Climbers stays read-only and renders normalized payloads", () => {
  const page = read("app/leaderboards/climbers/page.tsx")
  const route = read("app/api/climbers/public/route.ts")
  assert.match(page, /\/api\/climbers\/public/)
  assert.doesNotMatch(page, /create_climbers_season|finalize_climbers_season|activate/)
  assert.match(route, /climbers_seasons/)
  assert.match(route, /climbers_events/)
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/)
  const payload = normalizePublicClimbersPayload({ current_season_id: "season-1", seasons: [{ id: "season-1", label: "Season 1", starts_at: "2026-01-01", ends_at: "2026-02-01", status: "active", standings: [{ player_id: "player-1", screen_name: "Krys", points: 81, event_count: 1 }], winner_names: [] }] })
  assert.equal(payload.seasons[0]?.standings[0]?.screen_name, "Krys")
  assert.equal(payload.seasons[0]?.standings[0]?.points, 81)
})
