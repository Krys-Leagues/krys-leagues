import assert from "node:assert/strict"
import test from "node:test"
import sharp from "sharp"
import { DEFAULT_KWT_TROPHY_PLACEMENT, normalizeKwtTrophyPlacement, renderKwtPersonalizedTrophy } from "./trophyManager.ts"

test("renders an actual transparent PNG copy with the canonical name", async () => {
  const original = await sharp({ create: { width: 320, height: 180, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()
  const rendered = await renderKwtPersonalizedTrophy(original, "A Very Long Canonical Screen Name", { ...DEFAULT_KWT_TROPHY_PLACEMENT, width: 70 })
  const metadata = await sharp(rendered.bytes).metadata()
  assert.equal(metadata.format, "png")
  assert.equal(metadata.width, 320)
  assert.equal(metadata.height, 180)
  assert.equal(metadata.channels, 4)
  assert.notDeepEqual(Buffer.from(rendered.bytes), original)
})

test("rejects unsafe nameplate settings", () => {
  assert.throws(() => normalizeKwtTrophyPlacement({ width: 101 }), /within the image/)
  assert.throws(() => normalizeKwtTrophyPlacement({ fontFamily: "Comic Sans" as never }), /styling is invalid/)
})
