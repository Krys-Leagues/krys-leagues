import assert from "node:assert/strict"
import { test } from "node:test"
import { ownProfilePath, shouldAutoOpenOwnProfile } from "./playerProfilesRouting.ts"

test("player directory remains the default public destination", () => {
  assert.equal(shouldAutoOpenOwnProfile(""), false)
  assert.equal(shouldAutoOpenOwnProfile("?browse=1"), false)
  assert.equal(shouldAutoOpenOwnProfile("?profile=me"), true)
  assert.equal(shouldAutoOpenOwnProfile("?profile=me&browse=1"), false)
})

test("own profile routing preserves the canonical player ID", () => {
  assert.equal(ownProfilePath("b9150f7d-f024-4f56-9af8-a66fe99cf7a8"), "/players/b9150f7d-f024-4f56-9af8-a66fe99cf7a8")
  assert.equal(ownProfilePath(""), null)
})
