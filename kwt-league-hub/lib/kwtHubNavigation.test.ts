import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const hubSource = readFileSync(new URL("../app/kwt/page.tsx", import.meta.url), "utf8")
const artworkSource = readFileSync(new URL("./artworkPageMaps.ts", import.meta.url), "utf8")
const netSource = readFileSync(new URL("../app/kwt/net/page.tsx", import.meta.url), "utf8")

test("KWT Hub sends Current Tournament directly to the original NET board", () => {
  assert.match(artworkSource, /id: "current-tournament", label: "Current Tournament", href: "\/kwt\/net"/)
  assert.doesNotMatch(hubSource, /href: "\/kwt\/current"/)
})

test("KWT Hub keeps the approved NET controls and external Krys Leagues return destination", () => {
  assert.match(hubSource, /https:\/\/krysleagues\.com\//)
  for (const label of [
    "CURRENT WEEK",
    "PAST WEEKS",
    "SEASON NET",
    "ALL PLAYERS",
    "ELITE",
    "PRO",
    "SEMI-PRO",
    "AMATEUR",
    "PROVISIONAL",
    "FIND MY KWT STROKES",
    "GO TO KWT SITE — ENTER SCORES / VIEW GROSS",
  ]) {
    assert.match(netSource, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }
  assert.match(netSource, /fetch\("\/api\/kwt\/net"/)
})
