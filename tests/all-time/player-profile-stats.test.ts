import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("Player Stats uses a summary plus data-driven collapsible competition sections", () => {
  const profile = read("app/players/[id]/page.tsx")

  assert.match(profile, /Overall Career Summary/)
  assert.match(profile, /statsSectionToggle/)
  assert.match(profile, /aria-expanded=\{openStatsSection === /)
  for (const section of ["kwt", "stroke", "match", "pyp", "doubles", "pro", "solo", "monthly"]) {
    assert.match(profile, new RegExp(`\"${section}\"`))
  }
})

test("KWT stats preserve the paired score history and support a map filter", () => {
  const profile = read("app/players/[id]/page.tsx")
  const recordsApi = read("app/api/records/public/route.ts")
  const styles = read("app/players/[id]/page.module.css")

  assert.match(profile, /KWT Score History/)
  assert.match(profile, /fetch\("\/api\/records\/public\?view=courses"\)/)
  assert.match(profile, /mapNameForKwtCourse/)
  assert.match(profile, /course\.base_map/)
  assert.match(profile, /id="kwt-map-filter"/)
  assert.match(profile, /All maps · chronological/)
  assert.match(profile, /Season<\/th><th>Week<\/th><th>Easy<\/th><th>Hard<\/th><th>Total<\/th><th>Place<\/th>/)
  assert.match(profile, /history\.easy_score/)
  assert.match(profile, /history\.hard_score/)
  assert.match(profile, /history\.total_score/)
  assert.match(profile, /history\.placement \?\? "—"/)
  assert.match(recordsApi, /select\("id, code, base_map, display_name, difficulty"\)/)
  assert.match(recordsApi, /map\(course => course\.base_map\)/)
  assert.match(styles, /\.kwtHistoryTable th,[\s\S]*?\.kwtHistoryTable td[\s\S]*?text-align: center/)
})

test("Match statistics remain scoped to the Match section", () => {
  const profile = read("app/players/[id]/page.tsx")
  const matchStart = profile.indexOf("<span>Match</span>")
  const pypStart = profile.indexOf("<span>PYP</span>")

  assert.ok(matchStart >= 0)
  assert.ok(pypStart > matchStart)
  assert.match(profile.slice(matchStart, pypStart), /Matches played/)
  assert.match(profile.slice(matchStart, pypStart), /Win percentage/)
  assert.match(profile.slice(matchStart, pypStart), /Holes won/)
})
