import assert from "node:assert/strict"
import test from "node:test"
import { isPublishedBracket } from "../../lib/tournaments/publicProjection.ts"

test("public bracket projection hides draft, incomplete, and empty live brackets", () => {
  assert.equal(isPublishedBracket("draft", 32, 31), false)
  assert.equal(isPublishedBracket("live", 32, 0), false)
  assert.equal(isPublishedBracket("live", 32, 30), false)
  assert.equal(isPublishedBracket("live", 64, 62), false)
})

test("public bracket projection accepts complete 32 and 64 player graphs", () => {
  assert.equal(isPublishedBracket("live", 32, 31), true)
  assert.equal(isPublishedBracket("live", 64, 63), true)
})

test("public bracket projection rejects unsupported bracket sizes", () => {
  assert.equal(isPublishedBracket("live", 16, 15), false)
  assert.equal(isPublishedBracket("live", 128, 127), false)
})
