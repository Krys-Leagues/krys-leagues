import assert from "node:assert/strict"
import test from "node:test"
import { buildKwtDisplayRanks, divisionMedal, divisionMedalEmoji, KWT_TOP_TEN_POINTS, pointsForVerifiedRank, standardCompetitionRanks } from "./kwtNetCompetition.ts"

test("KWT standard competition ranks preserve ties", () => {
  assert.deepEqual(standardCompetitionRanks([10, 12, 12, 14]), [1, 2, 2, 4])
})

test("KWT display ranks keep overall and division ranks separate", () => {
  const ranks = buildKwtDisplayRanks([
    { playerId: "elite", division: "ELITE", combinedNet: -50 },
    { playerId: "amateur-a", division: "AMATEUR", combinedNet: -40 },
    { playerId: "amateur-b", division: "AMATEUR", combinedNet: -40 },
    { playerId: "amateur-c", division: "AMATEUR", combinedNet: -30 },
  ])

  assert.equal(ranks.overall.get("elite"), 1)
  assert.equal(ranks.overall.get("amateur-a"), 2)
  assert.equal(ranks.overall.get("amateur-b"), 2)
  assert.equal(ranks.overall.get("amateur-c"), 4)
  assert.equal(ranks.byDivision.get("AMATEUR")?.get("amateur-a"), 1)
  assert.equal(ranks.byDivision.get("AMATEUR")?.get("amateur-b"), 1)
  assert.equal(ranks.byDivision.get("AMATEUR")?.get("amateur-c"), 3)
})

test("KWT points expose only the verified top-ten schedule", () => {
  assert.equal(pointsForVerifiedRank(1), 25)
  assert.equal(pointsForVerifiedRank(10), 10)
  assert.equal(pointsForVerifiedRank(11), 9)
  assert.equal(pointsForVerifiedRank(19), 1)
  assert.equal(pointsForVerifiedRank(20), 0)
  assert.equal(KWT_TOP_TEN_POINTS.length, 10)
})

test("division medals are relative to a division", () => {
  assert.equal(divisionMedal(1), "GOLD")
  assert.equal(divisionMedal(2), "SILVER")
  assert.equal(divisionMedal(3), "BRONZE")
  assert.equal(divisionMedal(4), null)
})

test("division medals are badge content, not overall rank content", () => {
  assert.equal(divisionMedalEmoji(1), "🥇")
  assert.equal(divisionMedalEmoji(2), "🥈")
  assert.equal(divisionMedalEmoji(3), "🥉")
  assert.equal(divisionMedalEmoji(9), "")
})
