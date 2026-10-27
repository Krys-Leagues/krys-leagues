import assert from "node:assert/strict"
import test from "node:test"

import sharp from "sharp"

import { renderPersonalizedTrophy } from "./trophy.ts"

test("trophy personalization renders a real PNG copy and preserves the source bytes", async () => {
  const original = await sharp({ create: { width: 160, height: 100, channels: 4, background: { r: 20, g: 30, b: 40, alpha: 1 } } }).png().toBuffer()
  const rendered = await renderPersonalizedTrophy(original, "Canonical Winner", { x: 50, y: 80, fontSize: 24, color: "#ffffff", align: "center" })
  const metadata = await sharp(rendered.bytes).metadata()
  assert.equal(metadata.format, "png")
  assert.equal(metadata.width, 160)
  assert.equal(metadata.height, 100)
  assert.notDeepEqual(Buffer.from(rendered.bytes), original)
  assert.equal(rendered.winnerName, "Canonical Winner")
  assert.deepEqual(rendered.placement, { x: 50, y: 80, fontSize: 24, color: "#ffffff", align: "center" })
})

test("trophy placement rejects unsafe or out-of-bounds values", async () => {
  const original = await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer()
  await assert.rejects(() => renderPersonalizedTrophy(original, "Winner", { x: 101, y: 50, fontSize: 18, color: "#fff" }), /between 0 and 100/)
  await assert.rejects(() => renderPersonalizedTrophy(original, "Winner", { x: 50, y: 50, fontSize: 18, color: "red" }), /hexadecimal/)
})
