import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const root = process.cwd()
const read = (path) => readFileSync(join(root, path), "utf8")

test("all five approved public league routes render their live data board", () => {
  const expected = [
    ["app/stroke/page.tsx", 'kind="stroke"'],
    ["app/doubles/page.tsx", 'kind="doubles"'],
    ["app/skins/page.tsx", 'kind="skins"'],
    ["app/amateur-pro/page.tsx", 'kind="pro"'],
  ]
  for (const [path, marker] of expected) {
    const source = read(path)
    assert.match(source, /PublicLeagueBoard/)
    assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), path)
  }
  assert.match(read("app/pyp/page.tsx"), /PublicPypBoard/)
})

test("public board seasons are data-driven and never hardcoded to a screenshot season", () => {
  const board = read("components/publicLeague/PublicLeagueBoard.tsx")
  const pyp = read("components/publicLeague/PublicPypBoard.tsx")
  assert.match(board, /order\("season_number", \{ ascending: false \}\)/)
  assert.match(board, /setSeason\(\(current\) => current && seasons\.includes\(current\) \? current : seasons\[0\]/)
  assert.match(pyp, /list_public_pyp_final_scorecard_seasons/)
  assert.match(pyp, /list_public_historical_pyp_seasons/)
  assert.doesNotMatch(board, /Season 58|Season 63|Season 204/)
  assert.doesNotMatch(pyp, /Season 14|Season 58|Season 63/)
})

test("public board navigation and canonical identity loading remain protected", () => {
  const map = read("lib/artworkPageMaps.ts")
  const board = read("components/publicLeague/PublicLeagueBoard.tsx")
  for (const href of ["/matches", "/standings", "/doubles-standings", "/amateur-pro-standings", "/pyp-standings", "/players", "/records"]) {
    assert.match(map, new RegExp(`href: "${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), href)
  }
  assert.match(board, /loadCanonicalPlayerDisplays\(ids\)/)
  assert.doesNotMatch(board, /insert\(|update\(|delete\(/)
})
