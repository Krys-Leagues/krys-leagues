import test from "node:test"
import assert from "node:assert/strict"
import { MASTERS_PREVIEW_NEVER_PLAYED, MASTERS_PREVIEW_PLAYERS, summarizeMastersPreview, totalStrokes, totalToPar } from "./mastersFinalResultsPreview.ts"

test("Masters preview includes every player with at least one verified round", () => {
  const summary = summarizeMastersPreview()
  assert.equal(MASTERS_PREVIEW_PLAYERS.length, 54)
  assert.equal(summary.eligibleCount, 54)
  assert.equal(summary.neverPlayedCount, 0)
  assert.equal(MASTERS_PREVIEW_NEVER_PLAYED.length, 3)
  assert.equal(summary.vipQualifiers.length, 10)
  assert.deepEqual(Object.fromEntries(summary.vipQualifiers.map((player) => [player.screenName, player.officialPlacement])), {
    BIGJA: 9, DUARDY: 1, DUCKK: 7, GOLDENBRETT: 6, GOMARINO13: 5, JESUNET: 8, leanin2it: 4, TRICKYDICKY: 3, ZANETTI: 2, ZONK: 9,
  })
})

test("Masters preview preserves null rounds and does not infer placements", () => {
  const summary = summarizeMastersPreview()
  const partial = summary.eligible.find((player) => player.screenName === "Captain")
  assert.ok(partial)
  assert.equal(partial.rounds[0], null)
  assert.equal(partial.officialPlacement, null)
  assert.equal(totalStrokes(partial), 149)
  assert.equal(totalToPar(partial), -48)
  assert.equal(summary.placementComplete, false)
})

test("approved Top 10 scores remain unchanged", () => {
  const expected = { DUARDY: [152, -108], ZANETTI: [154, -106], TRICKYDICKY: [159, -101], leanin2it: [160, -100], GOMARINO13: [162, -98], GOLDENBRETT: [163, -97], DUCKK: [165, -95], JESUNET: [166, -94], BIGJA: [167, -93], ZONK: [167, -93] }
  for (const player of MASTERS_PREVIEW_PLAYERS.filter((item) => item.officialPlacement !== null)) assert.deepEqual([totalStrokes(player), totalToPar(player)], expected[player.screenName as keyof typeof expected])
})
