import assert from "node:assert/strict"
import test from "node:test"
import { isMgaChampionshipEvent, ownerVipSearchMatches } from "./majorOwnerVip.ts"

test("only the MGA Championship event uses the owner-managed VIP list", () => {
  assert.equal(isMgaChampionshipEvent({ slug: "major-2", name: "Major 2" }), true)
  assert.equal(isMgaChampionshipEvent({ slug: "other-major", name: "THE MGA CHAMPIONSHIP" }), true)
  assert.equal(isMgaChampionshipEvent({ slug: "major-1", name: "The Mini-Golf Masters" }), false)
})

test("owner VIP player search is screen-name based and case-insensitive", () => {
  assert.equal(ownerVipSearchMatches("TRICKYDICKY", "tricky"), true)
  assert.equal(ownerVipSearchMatches("TRICKYDICKY", "other"), false)
  assert.equal(ownerVipSearchMatches("TRICKYDICKY", ""), true)
})
