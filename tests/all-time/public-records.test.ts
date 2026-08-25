import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { personalCombinedFallbackKey, rankByCombinedTotal, rankByScore } from "../../lib/all-time/public-records.ts"

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

test("Personal Combined fallback is purple only without a podium finish", () => {
  assert.equal(personalCombinedFallbackKey([{ key: "map-a", rank: 4 }, { key: "map-b", rank: 6 }]), "map-a")
  assert.equal(personalCombinedFallbackKey([{ key: "map-a", rank: 4 }, { key: "map-b", rank: 2 }]), null)
  assert.equal(personalCombinedFallbackKey([{ key: "map-a", rank: null }]), null)
})

test("active course filtering excludes SBE while retaining GLE and GLH", () => {
  const catalog = [{ code: "SBE", active: false }, { code: "GLE", active: true }, { code: "GLH", active: true }]
  assert.deepEqual(catalog.filter(course => course.active).map(course => course.code), ["GLE", "GLH"])
  assert.match(read("app/api/records/public/route.ts"), /\.eq\("active", true\)/)
})

test("Player Profile separates Easy/Hard from the paired Combined showcase", () => {
  const profile = read("components/records/PlayerCourseRecords.tsx"), styles = read("components/records/PublicRecordsUI.module.css"), api = read("app/api/records/public/route.ts")
  assert.match(profile, /\["Easy", "Hard"\]/)
  assert.match(profile, /category=Combined/)
  assert.match(profile, /profileCombinedRow/)
  assert.match(profile, /personalCombinedFallbackKey/)
  assert.doesNotMatch(profile, /profileTabs|aria-pressed|setCategory|<button/)
  assert.match(styles, /width:min\(100%,900px\)/)
  assert.match(styles, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
  assert.match(styles, /@media\(max-width:680px\).*grid-template-columns:1fr/)
  assert.match(styles, /\.profileCategoryTitle.*color:#fff/)
  assert.match(styles, /\.profileRankNumber\{color:#fff/)
  assert.match(styles, /\.profileCourse.*color:#fff/)
  assert.match(styles, /\.profileScore\{color:#fff/)
  assert.match(styles, /grid-template-columns:35px minmax\(0,1fr\) auto/)
  assert.match(api, /rankByCombinedTotal/)
  assert.match(api, /easyScore: own\.easy_score, hardScore: own\.hard_score, totalScore: own\.combined_score/)
  assert.match(styles, /profileFallbackRank\{color:#c084fc\}/)
  assert.doesNotMatch(profile, /NOT LINKED|identity review|source_rank/i)
})

test("Player Profile uses white numeric ranks without medals, podium colors, or best-current treatment", () => {
  const profile = read("components/records/PlayerCourseRecords.tsx"), styles = read("components/records/PublicRecordsUI.module.css")
  assert.doesNotMatch(profile, /<svg|profileMedal|Gold, rank|Silver, rank|Bronze, rank/)
  assert.match(profile, /`#\$\{rank\}`/)
  assert.doesNotMatch(profile, /profilePodium|bestCurrentRank|Best current rank|profileBestCurrent/)
  assert.doesNotMatch(styles, /profilePodium|profileBestCurrent|profileBestLabel|#fde68a|#e2e8f0|#fdba74|#a78bfa/)
  assert.match(profile, /styles\.profileScore/)
})

test("the real player profile route renders the redesigned All-Time component", () => {
  const route = read("app/players/[id]/page.tsx")
  const profile = read("components/records/PlayerCourseRecords.tsx")
  assert.match(route, /import PlayerCourseRecords from "@\/components\/records\/PlayerCourseRecords"/)
  assert.match(route, /openProfileSection === "records" && <PlayerCourseRecords playerId=\{player\.id\} \/>/)
  assert.match(profile, />All-Time Records<\/h2>/)
  assert.match(profile, /CATEGORIES\.map\(\(category\) =>/)
  for (const category of ["Easy", "Hard"]) assert.match(profile, new RegExp(`"${category}"`))
  assert.match(profile, /Combined leaderboard/)
  assert.doesNotMatch(profile, /All-Time individual and combined-map performances|profileTabs|aria-pressed|<button/)
  assert.match(profile, /<RankMark rank=\{row\.rank\} \/>/)
  assert.doesNotMatch(profile, /profileBestCurrent|Best current rank/)
})

test("KWT profile history is compact and does not expose unreliable rank or points", () => {
  const profile = read("app/players/[id]/page.tsx")
  const kwtStart = profile.indexOf("KWT Score History")
  const kwtBlock = profile.slice(kwtStart, kwtStart + 1800)
  assert.ok(kwtStart >= 0)
  assert.doesNotMatch(kwtBlock, /Historical KWT Scores|Historical rank|history\.points|history\.historical_rank/)
  assert.match(kwtBlock, /kwtEasyScore/)
  assert.match(kwtBlock, /kwtHardScore/)
})
