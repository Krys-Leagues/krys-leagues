import assert from "node:assert/strict"
import test from "node:test"
import { candidateDifferential, currentDifferential, summarizeCurrentRating } from "./ratingModel.ts"

test("current Production-style rating preserves negative scores and exact elite count", () => {
  const result = summarizeCurrentRating([-30, -30, -28, -25, -20], {
    eliteShare: 0.4,
    minimumReadySample: 5,
    minimumProvisionalSample: 3,
  })
  assert.equal(result.fieldAverage, -26.6)
  assert.equal(result.eliteCount, 2)
  assert.equal(result.eliteAverage, -30)
  assert.equal(result.courseRating, -30)
  assert.ok(Math.abs((result.slopeRating ?? 0) - 3.4) < 1e-9)
  assert.equal(result.eliteTiePolicy, "exact-count-lowest-scores")
  assert.equal(result.ratingStatus, "ready")
})

test("insufficient samples do not invent a missing course rating", () => {
  const result = summarizeCurrentRating([-30, -20], { eliteShare: 0.12, minimumReadySample: 50, minimumProvisionalSample: 3 })
  assert.equal(result.courseRating, null)
  assert.equal(result.slopeRating, null)
  assert.equal(result.ratingStatus, "needs_data")
})

test("current and candidate slope mathematics are explicit and separately versioned", () => {
  const base = currentDifferential(-25, -30)
  const candidate = candidateDifferential(-25, -30, 8, {
    id: "krys-candidate",
    version: "draft-1",
    adjust: ({ baseDifferential, slopeRating }) => baseDifferential * (slopeRating ?? 1) / 8,
  })
  assert.equal(base, 5)
  assert.equal(candidate, 5)
})
