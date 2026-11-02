import assert from "node:assert/strict"
import test from "node:test"

import { getMajorVipEligiblePlayers, type MajorVipPlacement } from "./majorVipEligibility.ts"

const placement = (screenName: string, fieldPlacement: number, overrides: Partial<MajorVipPlacement> = {}): MajorVipPlacement => ({
  player_id: screenName.toLowerCase(),
  player_screen_name_snapshot: screenName,
  weekend_field: "main",
  field_placement: fieldPlacement,
  result_status: "completed",
  is_finalized: true,
  ...overrides,
})

test("includes every finalized Main Event player through placement 10", () => {
  const eligible = getMajorVipEligiblePlayers([
    placement("T10-A", 10),
    placement("T1", 1),
    placement("T11", 11),
    placement("T10-B", 10),
  ])

  assert.deepEqual(eligible.map((player) => player.screenName), ["T1", "T10-A", "T10-B"])
  assert.equal(eligible.length, 3)
})

test("does not qualify non-finalized, non-Main, or non-completed rows", () => {
  const eligible = getMajorVipEligiblePlayers([
    placement("Pending", 1, { is_finalized: false }),
    placement("Secondary", 2, { weekend_field: "secondary" }),
    placement("DidNotFinish", 3, { result_status: "did_not_finish" }),
    placement("Valid", 4),
  ])

  assert.deepEqual(eligible.map((player) => player.screenName), ["Valid"])
})
