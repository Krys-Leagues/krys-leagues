import assert from "node:assert/strict"
import test from "node:test"
import { KWT_SEASON_15_WEEK_01_SOURCE_SHA256, KWT_SEASON_15_WEEK_01_VERIFIED_BADGES, verifiedWeek01Badges } from "./kwtSeason15Week01Verification.ts"

test("Week 01 badge manifest is source-bound and hole-evidence derived", () => {
  assert.equal(KWT_SEASON_15_WEEK_01_SOURCE_SHA256, "8C9A20EFB45B6399AD4F7DBCFB3633B8C63A6F9F5C6A7A5385069B1A8A0D8D7D")
  assert.deepEqual(verifiedWeek01Badges("2e4ce1d8-afd6-44a2-9560-f85c16f23747"), ["COCONUT"])
  assert.deepEqual(verifiedWeek01Badges("d38c0220-8a80-45a6-86e8-d495f523d5ab"), ["KIWI_EASY"])
  assert.deepEqual(verifiedWeek01Badges("fbd60e4a-9d17-4556-9062-dc005a0c5723"), ["KIWI_EASY"])
  assert.equal(Object.keys(KWT_SEASON_15_WEEK_01_VERIFIED_BADGES).length, 3)
  assert.deepEqual(verifiedWeek01Badges("unknown-player"), [])
})

test("Week 01 has no verified Hard-only row to receive Gold Kiwi", () => {
  assert.equal(Object.values(KWT_SEASON_15_WEEK_01_VERIFIED_BADGES).some((badges) => badges.includes("KIWI_HARD")), false)
})
