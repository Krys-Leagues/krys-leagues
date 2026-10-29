import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("KWT hub uses the approved artwork and preserves public card destinations", () => {
  const page = read("app/kwt/page.tsx")
  const map = read("lib/artworkPageMaps.ts")
  assert.match(map, /kwt-hub-approved\.png/)
  assert.equal(existsSync("public/approved-pages/kwt-hub-approved.png"), true)
  assert.doesNotMatch(map, /kwt-hub-approved\.jpg/)
  assert.match(map, /aspectRatio:\s*"1149 \/ 1369"/)
  assert.doesNotMatch(map, /Krys Weekly Tournament/)
  assert.match(page, /ArtworkNavigation/)
  assert.match(page, /kwtArtwork/)
  assert.match(map, /dqvo64m7q9ujvqa-wmgt23ai[^\"]+\/kwt\/home/)
  assert.match(map, /href: "\/kwt\/upcoming"/)
  assert.match(map, /href: "\/champions\?league=kwt&from=kwt"/)
  assert.match(map, /href: "\/kwt\/records"/)
  for (const label of ["Current Tournament", "Upcoming Events", "Past Champions", "Records"]) assert.match(map, new RegExp(label))
})

test("KWT Past Champions scopes the Hall while the default Hall remains full", () => {
  const champions = read("app/champions/page.tsx")
  const mainHub = read("lib/artworkPageMaps.ts")
  assert.match(champions, /useSearchParams/)
  assert.match(champions, /eq\("league_type", "kwt"\)/)
  assert.match(champions, /resolveHallScope/)
  assert.match(champions, /scope === "kwt"\) return "🏆 KWT Hall of Champions"/)
  assert.match(champions, /scope === "kwt"\) return "\/kwt"/)
  assert.match(mainHub, /\{ id: "hall-of-champions", label: "Hall of Champions", href: "\/champions"/)
})

test("KWT upcoming content has the approved dates and local navigation", () => {
  const page = read("app/kwt/upcoming/page.tsx")
  const content = read("lib/kwtPublicContent.ts")
  assert.match(page, /image_url: KWT_WEEKLY_FEATURE_ASSET/)
  assert.match(page, /KWT_WEEKLY_FEATURE_ASSET/)
  assert.match(page, /KWT_SEASON_TROPHY_BOARD_ASSET/)
  assert.match(page, /href="\/kwt"/)
  for (const date of ["2026-09-11", "2026-09-18", "2026-09-25", "2026-10-02", "2026-10-09", "2026-10-16"]) assert.match(content, new RegExp(date))
})

test("KWT records use the cleaned player-facing title and searchable selector", () => {
  const page = read("app/kwt/records/page.tsx")
  assert.match(page, /<h1[^>]*>KWT Records<\/h1>/)
  assert.match(page, /get_public_kwt_course_records/)
  assert.match(page, /buildKwtCourseRecords/)
  assert.match(page, /Select Course/)
  assert.match(page, /role="combobox"/)
  assert.doesNotMatch(page, /KWT Achievements|No recorded KWT achievement ownership|KWT-only course records/)
  assert.doesNotMatch(page, /Best KWT scores|record\.record_kind|combined_score|source_count|badgeLeaders/)
  assert.match(page, /href="\/kwt"/)
  assert.doesNotMatch(page, /href="\/records"/)
})
