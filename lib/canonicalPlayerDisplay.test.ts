import assert from "node:assert/strict"
import test from "node:test"

import {
  buildCanonicalPlayerDisplays,
  findCanonicalFamilyConflicts,
  historicalPlayerName,
  uniqueCanonicalCurrentPlayers,
} from "./canonicalPlayerDisplayCore.ts"

const canonicalId = "11111111-1111-1111-1111-111111111111"
const mergedId = "22222222-2222-2222-2222-222222222222"
const retiredId = "33333333-3333-3333-3333-333333333333"

const displays = buildCanonicalPlayerDisplays(
  [canonicalId, mergedId, retiredId],
  [
    { source_player_id: canonicalId, canonical_player_id: canonicalId },
    { source_player_id: mergedId, canonical_player_id: canonicalId },
    { source_player_id: retiredId, canonical_player_id: retiredId },
  ],
  [
    { id: canonicalId, screen_name: "Current Player", active: true, status: "active" },
    { id: retiredId, screen_name: "Retired Player", active: false, status: "retired" },
  ],
)

test("active canonical player displays normally", () => {
  assert.deepEqual(displays[0], {
    source_player_id: canonicalId,
    canonical_player_id: canonicalId,
    screen_name: "Current Player",
    eligible: true,
  })
})

test("merged UUID resolves to the active canonical display", () => {
  assert.equal(displays[1].canonical_player_id, canonicalId)
  assert.equal(displays[1].screen_name, "Current Player")
  assert.equal(displays[1].eligible, true)
})

test("archived identity is not displayed separately", () => {
  assert.deepEqual(uniqueCanonicalCurrentPlayers(displays), [
    { id: canonicalId, screen_name: "Current Player" },
  ])
})

test("retired canonical player is excluded", () => {
  assert.equal(displays[2].eligible, false)
  assert.equal(displays[2].screen_name, null)
})

test("two source UUIDs in one canonical family report a standings conflict", () => {
  assert.deepEqual(findCanonicalFamilyConflicts([canonicalId, mergedId], displays), [
    { canonical_player_id: canonicalId, source_player_ids: [canonicalId, mergedId] },
  ])
})

test("unresolved historical source names remain historical", () => {
  assert.equal(historicalPlayerName(undefined, "Original Source Name"), "Original Source Name")
  assert.equal(historicalPlayerName(displays[2], "Retired Era Name"), "Retired Era Name")
})
