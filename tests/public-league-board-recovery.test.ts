import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (path: string) => readFileSync(path, "utf8")

test("League Play destinations expose read-only public boards without mutation controls", () => {
  const pages = [
    ["app/stroke/page.tsx", "PublicStrokeBoard"],
    ["app/amateur-pro/page.tsx", "PublicLeagueBoard kind=\"pro\""],
    ["app/pyp/page.tsx", "PublicPypBoard"],
    ["app/skins/page.tsx", "PublicLeagueBoard kind=\"skins\""],
  ] as const

  for (const [path, marker] of pages) assert.match(read(path), new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.match(read("app/doubles/page.tsx"), /DoublesLiveScoring/)
  assert.doesNotMatch(read("app/doubles/page.tsx"), /PublicLeagueBoard kind=\"doubles\"/)
  assert.match(read("app/api/public/league-board/route.ts"), /loadPublicLeagueBoard/)
  assert.doesNotMatch(read("components/publicLeague/PublicLeagueBoard.tsx"), /method:\s*["']POST|supabase\.from\([^)]*\)\.insert|supabase\.from\([^)]*\)\.update/)
})

test("Stroke keeps the approved public presentation background", () => {
  assert.match(read("app/stroke/page.module.css"), /stroke-play-approved\.jpg/)
})
