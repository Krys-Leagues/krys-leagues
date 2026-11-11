import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { test } from "node:test"

const page = readFileSync(new URL("../app/kwt/net/history/page.tsx", import.meta.url), "utf8")
const css = readFileSync(new URL("../app/kwt/net/page.module.css", import.meta.url), "utf8")

test("NET History preserves verified ranks, tie handling, and approved badge artwork", () => {
  assert.match(page, /buildKwtDisplayRanks\(rows\)/)
  assert.match(page, /<th>RANK<\/th>/)
  assert.match(page, /ranks\.overall\.get\(row\.playerId\)/)
  assert.match(page, /divisionMedalEmoji\(divisionRank\)/)
  assert.match(page, /aria-label=\{badgeLabel\(badge\)\}/)
  assert.match(page, /title=\{badgeLabel\(badge\)\}/)
  for (const asset of ["public/kwt/green-kiwi-sticker.png", "public/kwt/gold-kiwi-sticker.png", "public/kwt/coconut-sticker.png"]) {
    assert.equal(existsSync(asset), true)
  }
})

test("NET History keeps the approved course-photo and responsive presentation hooks", () => {
  assert.match(page, /styles\.raptorTheme/)
  assert.match(page, /event\.courseName/)
  assert.match(css, /raptor-cliffs-season15-week01\.png/)
  assert.match(css, /@media\(max-width:700px\)/)
})
