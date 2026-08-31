import test from "node:test"
import assert from "node:assert/strict"
import { calculateAtomicCardEffects, calculateCardTotals, holeParStatsAvailable } from "./late-backfill-batch.ts"

const holes = (value: number) => Array.from({ length: 18 }, () => value)

test("card totals support 18 holes, relative score, and HIO count", () => {
  const values = holes(2); values[0] = 1
  assert.deepEqual(calculateCardTotals(values, 36), { totalStrokes: 35, score: -1, hioCount: 1 })
})

test("two-player and four-player cards use one identical pre-card snapshot", () => {
  const preCardBest = [
    { playerId: "ahead", score: -5 },
    { playerId: "middle", score: -2 },
    { playerId: "behind", score: 0 },
  ]
  const twoPlayer = calculateAtomicCardEffects(preCardBest, 36, [
    { id: "p1", holeStrokes: holes(1) },
    { id: "p2", holeStrokes: holes(1) },
  ])
  assert.deepEqual(twoPlayer.map((effect) => effect.oldPbScore), [null, null])
  assert.deepEqual(twoPlayer.map((effect) => effect.classification), ["FIRST", "FIRST"])

  const fourPlayer = calculateAtomicCardEffects(preCardBest, 36, [
    { id: "ahead", holeStrokes: holes(1) },
    { id: "middle", holeStrokes: holes(1) },
    { id: "behind", holeStrokes: holes(1) },
    { id: "new", holeStrokes: holes(1) },
  ])
  assert.deepEqual(fourPlayer.map((effect) => effect.oldPbScore), [-5, -2, 0, null])
  assert.deepEqual(fourPlayer.map((effect) => effect.classification), ["BETTER", "BETTER", "BETTER", "FIRST"])
  assert.deepEqual(fourPlayer.map((effect) => effect.points), [2, 2, 2, 0])
})

test("player entry order cannot change same-card pass counts or mixed classifications", () => {
  const preCardBest = [
    { playerId: "p1", score: -1 },
    { playerId: "p2", score: 1 },
    { playerId: "p3", score: 4 },
  ]
  const card = [
    { id: "p1", holeStrokes: [1, 1, ...holes(2).slice(2)] }, // -2: BETTER, passes p2 and p3
    { id: "p2", holeStrokes: [3, ...holes(2).slice(1)] }, // 1: EQUAL against the snapshot
    { id: "new", holeStrokes: holes(2) }, // FIRST
  ]
  const forward = calculateAtomicCardEffects(preCardBest, 36, card)
  const reverse = calculateAtomicCardEffects(preCardBest, 36, [...card].reverse())
  const normalize = (effects: ReturnType<typeof calculateAtomicCardEffects>) => effects.sort((a, b) => a.playerId.localeCompare(b.playerId))
  assert.deepEqual(normalize(forward), normalize(reverse))
  assert.equal(forward.find((effect) => effect.playerId === "p1")?.classification, "BETTER")
  assert.equal(forward.find((effect) => effect.playerId === "p2")?.classification, "EQUAL")
  assert.equal(forward.find((effect) => effect.playerId === "new")?.classification, "FIRST")
})

test("ties are not passed and incomplete hole pars disable hole-specific stats without blocking raw capture", () => {
  const tieHoles = [1, ...holes(2).slice(1)]
  const effect = calculateAtomicCardEffects([{ playerId: "tied", score: -1 }, { playerId: "passed", score: -1 }], 36, [{ id: "tied", holeStrokes: tieHoles }])[0]
  assert.equal(effect.classification, "EQUAL")
  assert.deepEqual(effect.passedPlayerIds, [])
  assert.equal(holeParStatsAvailable(null, 36), false)
  assert.equal(holeParStatsAvailable([4, 4, 4], 36), false)
  assert.equal(holeParStatsAvailable(holes(2), 36), true)
})

test("duplicate players are rejected before a card can be saved", () => {
  assert.throws(() => calculateAtomicCardEffects([], 36, [
    { id: "same", holeStrokes: holes(2) },
    { id: "same", holeStrokes: holes(2) },
  ]), /same canonical player/)
})
