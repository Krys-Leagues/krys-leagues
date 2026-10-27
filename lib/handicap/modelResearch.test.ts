import assert from "node:assert/strict"
import test from "node:test"
import {
  currentDifferentialResearch,
  distributionStandardScore,
  median,
  slopeNormalizedDifferential,
} from "./modelResearch.ts"

const easy = {
  courseRating: -24,
  slopeRating: 6,
  fieldAverage: -18,
  fieldStandardDeviation: 5,
}
const hard = {
  courseRating: -18,
  slopeRating: 12,
  fieldAverage: -6,
  fieldStandardDeviation: 8,
}

test("research models preserve negative scores and better-round ordering", () => {
  assert.equal(currentDifferentialResearch(-24, easy), 0)
  assert.equal(currentDifferentialResearch(-22, easy), 2)
  assert.ok((slopeNormalizedDifferential(-24, easy, 9) ?? 99) < (slopeNormalizedDifferential(-22, easy, 9) ?? -99))
  assert.ok((distributionStandardScore(-24, easy) ?? 99) < (distributionStandardScore(-22, easy) ?? -99))
})

test("data-derived slope normalization compares equivalent raw margins differently", () => {
  const reference = median([easy.slopeRating, hard.slopeRating]) ?? 0
  assert.equal(reference, 9)
  assert.equal(slopeNormalizedDifferential(-22, easy, reference), 3)
  assert.equal(slopeNormalizedDifferential(-16, hard, reference), 1.5)
})

test("distribution-relative model exposes a different, auditable comparison", () => {
  assert.equal(distributionStandardScore(-22, easy), -0.8)
  assert.equal(distributionStandardScore(-16, hard), -1.25)
})

test("candidate models return null rather than inventing missing spread", () => {
  assert.equal(slopeNormalizedDifferential(-20, { ...easy, slopeRating: 0 }, 9), null)
  assert.equal(distributionStandardScore(-20, { ...easy, fieldStandardDeviation: 0 }), null)
})
