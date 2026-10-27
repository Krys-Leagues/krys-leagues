import assert from "node:assert/strict"
import test from "node:test"

import { compareStoredHandicapIndexes, formatGolfHandicapIndex } from "./indexDisplay.ts"

test("golf notation displays a negative stored index with a plus sign", () => {
  assert.equal(formatGolfHandicapIndex(-2.15), "+2.15")
})

test("positive and zero indexes keep golf notation without a plus on positive values", () => {
  assert.equal(formatGolfHandicapIndex(4.27), "4.27")
  assert.equal(formatGolfHandicapIndex(0), "0.00")
  assert.equal(formatGolfHandicapIndex(-0.004), "0.00")
})

test("index formatting rounds to two decimals without changing the stored value", () => {
  assert.equal(formatGolfHandicapIndex(-2.156), "+2.16")
  assert.equal(formatGolfHandicapIndex(4.274), "4.27")
  assert.equal(formatGolfHandicapIndex(null), "—")
})

test("sorting uses the underlying signed values, not the golf display strings", () => {
  const values = [4.27, -2.15, 0, -0.5, null]
  assert.deepEqual(values.toSorted(compareStoredHandicapIndexes), [-2.15, -0.5, 0, 4.27, null])
})
