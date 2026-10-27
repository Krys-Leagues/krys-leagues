import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { normalizePublicClimbersPayload } from "../lib/publicClimbers.ts"
import { formatClimbersDateRange, formatClimbersSeasonLabel } from "../lib/climbersDisplay.ts"

const read = (path: string) => readFileSync(path, "utf8")

test("canonical public Climbers route restores the read-only tribute and reader", () => {
  const page = read("app/leaderboards/climbers/page.tsx")
  const route = read("app/api/climbers/public/route.ts")
  assert.match(page, /THANK YOU, YUK1N/)
  assert.match(page, /recognition\/yuk1n\.png/)
  assert.match(page, /\/api\/climbers\/public/)
  assert.match(page, /Climber of the Season/)
  assert.doesNotMatch(page, /create_climbers_season|finalize_climbers_season|activate/)
  assert.match(route, /from\("climbers_seasons"\)/)
  assert.match(route, /from\("climbers_events"\)/)
  assert.match(route, /player:players!climbers_events_player_id_fkey\(id,screen_name\)/)
  assert.match(route, /!item\.voided_at/)
})

test("current All-Time navigation reaches Climbers without replacing /records", () => {
  const page = read("components/records/PublicAllTimeRecordsPage.tsx")
  assert.match(page, /href="\/leaderboards\/climbers"/)
  assert.match(page, /href="\/records\/submit"/)
})

test("empty and normal season payloads remain renderable", () => {
  assert.deepEqual(normalizePublicClimbersPayload({ current_season_id: null, seasons: [] }).seasons, [])
  const payload = normalizePublicClimbersPayload({ current_season_id: "season-1", seasons: [{ id: "season-1", label: "Season 1", starts_at: "2026-01-01", ends_at: "2026-02-01", status: "active", standings: [{ player_id: "player-1", screen_name: "Krys", points: 3, event_count: 1 }], winner_names: [] }] })
  assert.equal(payload.seasons[0]?.standings[0]?.screen_name, "Krys")
  assert.equal(payload.current_season_id, "season-1")
  assert.equal(formatClimbersSeasonLabel("Aug 29â€“Sep 11, 2026"), "Aug 29–Sep 11, 2026")
  assert.equal(formatClimbersDateRange("2026-08-29T00:00:00Z", "2026-09-12T00:00:00Z"), "Aug 29, 2026 – Sep 11, 2026")
})
