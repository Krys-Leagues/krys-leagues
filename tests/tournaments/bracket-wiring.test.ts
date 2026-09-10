import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("Bracket Tournaments uses the preserved artwork with a live preview overlay", () => {
  const page = read("app/tournaments/page.tsx")
  const map = read("lib/artworkPageMaps.ts")
  const panel = read("app/tournaments/LiveBracketPanel.tsx")
  assert.match(page, /ArtworkNavigation/)
  assert.match(page, /LiveBracketPanel/)
  assert.match(map, /ChatGPT Image Sep 7, 2026, 02_20_03 PM\.png/)
  assert.match(map, /live-bracket-preview/)
  assert.match(panel, /LIVE_BRACKET_ROTATION_MS = 15_000/)
  assert.match(panel, /prefers-reduced-motion/)
  assert.match(panel, /onPointerEnter/)
  assert.match(panel, /aria-selected/)
})

test("Current Brackets remains static while data refresh stays server-side", () => {
  const page = read("app/tournaments/current/page.tsx")
  const adapter = read("lib/tourneyBot.ts")
  assert.match(page, /autoRotate=\{false\}/)
  assert.match(page, /revalidate = 60/)
  assert.match(adapter, /tourneybot\.gg\/tourneys\/71394/)
  assert.match(adapter, /tourneybot\.gg\/tourneys\/72111/)
  assert.match(adapter, /__NEXT_DATA__/)
  assert.match(adapter, /pageProps\.tourney/)
  assert.match(adapter, /revalidate: 60/)
  assert.doesNotMatch(read("app/tournaments/LiveBracketPanel.tsx"), /fetch\(/)
})
