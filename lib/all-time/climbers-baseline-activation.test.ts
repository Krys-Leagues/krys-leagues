import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  CLIMBERS_BASELINE_CUTOFF,
  CLIMBERS_BASELINE_IMPORT_KEY,
  EXPECTED_CLIMBERS_BASELINE,
  summarizeClimbersBaseline,
  validateClimbersBaselineForActivation,
  type ClimbersBaselineSourceRow,
} from "./climbers-baseline-activation.ts"

function expectedRows(): ClimbersBaselineSourceRow[] {
  return Array.from({ length: 79 }, (_, index) => ({
    source_name: `SOURCE_${index}`,
    ytd_points: index === 0 ? 15_210 : null,
    period_points: index === 1 ? 682 : null,
    canonical_player_id: `player-${Math.min(index, 77)}`,
    identity_status: "resolved",
  }))
}

test("summarizes the verified legacy baseline without using ranks", () => {
  assert.deepEqual(summarizeClimbersBaseline(expectedRows()), EXPECTED_CLIMBERS_BASELINE)
})

test("activation validation requires the exact staged marker and totals", () => {
  const marker = { import_key: CLIMBERS_BASELINE_IMPORT_KEY, cutoff_at: CLIMBERS_BASELINE_CUTOFF, applied_at: null }
  assert.deepEqual(validateClimbersBaselineForActivation(marker, summarizeClimbersBaseline(expectedRows())), { valid: true, issues: [] })
  assert.equal(validateClimbersBaselineForActivation({ ...marker, cutoff_at: "2026-08-15T00:00:00+00:00" }, summarizeClimbersBaseline(expectedRows())).valid, true)
  assert.equal(validateClimbersBaselineForActivation({ ...marker, applied_at: "2026-08-20T00:00:00Z" }, summarizeClimbersBaseline(expectedRows())).valid, false)
})

test("activation route uses the authenticated admin path and existing protected RPC", async () => {
  const route = await readFile(new URL("../../app/api/admin/records/climbers/baseline/activate/route.ts", import.meta.url), "utf8")
  assert.match(route, /authorizeSiteAdminMutation/)
  assert.match(route, /apply_climbers_legacy_baseline/)
  assert.match(route, /summarizeClimbersBaseline/)
  assert.doesNotMatch(route, /service_role|create_climbers_season|insert\s+into/i)
})

test("the admin page exposes an explicit, separated activation control", async () => {
  const page = await readFile(new URL("../../app/admin/records/climbers/page.tsx", import.meta.url), "utf8")
  assert.match(page, /ACTIVATE VERIFIED LEGACY CLIMBERS BASELINE/)
  assert.match(page, /window\.confirm/)
  assert.match(page, /baseline\/activate/)
})
