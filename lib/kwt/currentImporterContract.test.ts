import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const migration = readFileSync(new URL("supabase/proposals/20261026_kwt_current_season_importer.proposed.sql", root), "utf8")
const route = readFileSync(new URL("app/api/admin/kwt/score-current-season/route.ts", root), "utf8")
const page = readFileSync(new URL("app/admin/kwt/score-current-season/page.tsx", root), "utf8")
const placementFix = readFileSync(new URL("supabase/proposals/20261026_kwt_current_import_gross_division_placement_fix.proposed.sql", root), "utf8")

test("current-season importer is additive, admin-gated, staged, and idempotent", () => {
  assert.match(migration, /create table if not exists public\.kwt_current_import_batches/)
  assert.match(migration, /create table if not exists public\.kwt_current_import_rows/)
  assert.match(migration, /stage_kwt_current_import/)
  assert.match(migration, /commit_kwt_current_import/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /source_sha256 text not null unique/)
  assert.match(migration, /revoke all on public\.kwt_current_import_batches from public, anon, authenticated/)
  assert.match(migration, /save_kwt_operational_result/)
  assert.doesNotMatch(migration, /delete from public\.kwt_operational_results/)
  assert.match(route, /authorizeSiteAdminMutation\(\)/)
  assert.match(route, /stage_kwt_current_import/)
  assert.match(route, /commit_kwt_current_import/)
  assert.match(route, /player_league_memberships/)
  assert.match(route, /KWT_ROSTER_PREFLIGHT_FAILED/)
  assert.match(route, /admin_add_player_league_membership/)
  assert.match(page, /Confirm and apply reviewed results/)
  assert.match(page, /Review \/ enroll/)
  assert.match(page, /Historical KWT Importer/)
  assert.match(placementFix, /refresh_kwt_current_import_placements/)
  assert.match(placementFix, /rank\(\) over \(partition by division order by total_score asc\)/)
  assert.match(placementFix, /Only a preview batch can be recalculated/)
  assert.doesNotMatch(placementFix, /kwt_operational_results/)
})
