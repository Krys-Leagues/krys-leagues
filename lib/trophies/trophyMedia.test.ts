import assert from "node:assert/strict"
import test from "node:test"
import { trophyMediaExtension, trophyMediaKind } from "./trophyMedia.ts"

test("selects image rendering for PNG trophy media", () => {
  assert.equal(trophyMediaKind("/trophies/winner.PNG?version=2"), "image")
  assert.equal(trophyMediaExtension("/trophies/winner.PNG?version=2"), "png")
})

test("selects video rendering for MP4 trophy media", () => {
  assert.equal(trophyMediaKind("/league-media/trophies/krys%20cup.mp4"), "video")
})

test("rejects unsupported trophy media", () => {
  assert.equal(trophyMediaKind("/trophies/trophy.svg"), "unsupported")
})
