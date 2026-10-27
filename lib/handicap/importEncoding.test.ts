import assert from "node:assert/strict"
import test from "node:test"
import { decodeDictionary, decodeNullableDictionary, encodeDictionary, encodeNullableDictionary } from "./importEncoding.ts"

test("dictionary encoding preserves repeated values by dictionary index", () => {
  const values = ["alpha", "beta", "alpha", "gamma", "beta"]
  const encoded = encodeDictionary(values)

  assert.deepEqual(encoded.values, ["alpha", "beta", "gamma"])
  assert.deepEqual(encoded.indexes, [1, 2, 1, 3, 2])
  assert.deepEqual(decodeDictionary(encoded), values)
})

test("nullable dictionary encoding reserves zero for missing identity", () => {
  const values = ["player-a", null, "player-b", undefined, "player-a", ""]
  const encoded = encodeNullableDictionary(values)

  assert.deepEqual(encoded.values, ["player-a", "player-b"])
  assert.deepEqual(encoded.indexes, [1, 0, 2, 0, 1, 0])
  assert.deepEqual(decodeNullableDictionary(encoded), ["player-a", null, "player-b", null, "player-a", null])
})

test("dictionary indexes never point beyond the unique dictionary", () => {
  const values = Array.from({ length: 100 }, (_, index) => `player-${index % 7}`)
  const encoded = encodeDictionary(values)

  assert.ok(encoded.indexes.every((index) => index >= 1 && index <= encoded.values.length))
  assert.deepEqual(decodeDictionary(encoded), values)
})
