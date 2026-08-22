import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { rankByCombinedTotal, rankByScore } from "../../lib/all-time/public-records.ts"

const read = (path: string) => readFileSync(path, "utf8")

test("public Records directly renders Single and contains no Admin importer links", () => {
  const page = read("app/records/page.tsx")
  assert.match(page, /PublicSingleRecordsPage/)
  assert.doesNotMatch(page, /admin\/records|Import CSV|identity review/i)
  assert.match(read("app/records/single/page.tsx"), /redirect\("\/records"\)/)
})

test("public Single uses active UUID-scoped courses and difficulty score colors", () => {
  const page = read("components/records/PublicSingleRecordsPage.tsx")
  const api = read("app/api/records/public/route.ts")
  assert.match(api, /\.eq\("active", true\)/)
  assert.match(api, /\.eq\("course_id", course\.id\)/)
  assert.match(page, /styles\.easy:styles\.hard/)
  assert.match(page, /`\/players\/\$\{record\.player_id\}`/)
  assert.doesNotMatch(page, /single_course_records|NOT LINKED|identity diagnostics/i)
})

test("20E-sized fixture keeps all 132 rows and dense ranks ties", () => {
  const rows = Array.from({ length: 132 }, (_, index) => ({ id: index, score: index < 3 ? -25 : index < 5 ? -24 : -22 + index }))
  const ranked = rankByScore(rows)
  assert.equal(ranked.length, 132)
  assert.deepEqual(ranked.slice(0, 6).map(row => row.rank), [1, 1, 1, 2, 2, 3])
})

test("Combined rank is dense-ranked from total and never imported rank", () => {
  const ranked = rankByCombinedTotal([-40, -40, -39, -38, -38, -36].map((combined_score, id) => ({ id, combined_score, imported_rank: 999 })))
  assert.deepEqual(ranked.map(row => row.rank), [1, 1, 2, 3, 3, 4])
  const page = read("app/records/combined/page.tsx")
  assert.match(read("app/api/records/public/route.ts"), /rankByCombinedTotal/)
  assert.match(page, /styles\.combinedEasy/)
  assert.match(page, /styles\.combinedHard/)
  assert.doesNotMatch(page, /source_rank|imported_rank/)
})

test("active course filtering excludes SBE while retaining GLE and GLH", () => {
  const catalog = [{ code: "SBE", active: false }, { code: "GLE", active: true }, { code: "GLH", active: true }]
  assert.deepEqual(catalog.filter(course => course.active).map(course => course.code), ["GLE", "GLH"])
  assert.match(read("app/api/records/public/route.ts"), /\.eq\("active", true\)/)
})

test("Player Profile exposes four compact record categories with combined-total ranks", () => {
  const profile = read("components/records/PlayerCourseRecords.tsx"), api = read("app/api/records/public/route.ts")
  for (const category of ["Easy", "Combined Easy", "Hard", "Combined Hard"]) assert.match(profile, new RegExp(`"${category}"`))
  assert.match(api, /rankByCombinedTotal/)
  assert.match(api, /difficulty === "Easy" \? own\.easy_score : own\.hard_score/)
  assert.doesNotMatch(profile, /NOT LINKED|identity review|source_rank/i)
})
