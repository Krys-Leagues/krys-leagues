import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import {
  divisionOptionsForSelection,
  initializeMonthlySelection,
  monthOptionsForYear,
  resetAfterMonthChange,
  resetAfterYearChange,
  selectionForPeriod,
  shouldLoadMonthlyResults,
  type MonthlyPeriodOption,
} from "../../lib/monthlyPublicView.ts"

const route = readFileSync(new URL("../../app/api/monthlies/public/route.ts", import.meta.url), "utf8")
const page = readFileSync(new URL("../../app/monthlies/page.tsx", import.meta.url), "utf8")
const styles = readFileSync(new URL("../../app/monthlies/page.module.css", import.meta.url), "utf8")
const artworkMaps = readFileSync(new URL("../../lib/artworkPageMaps.ts", import.meta.url), "utf8")
const profile = readFileSync(new URL("../../app/players/[id]/page.tsx", import.meta.url), "utf8")

test("public Monthly endpoint uses a server-only client and a constrained public projection", () => {
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/)
  assert.match(route, /historical_monthly_score_observations/)
  assert.match(route, /player:players\(screen_name\)/)
  assert.match(route, /availablePeriods/)
  assert.match(route, /period_year.*period_month.*division/)
  assert.match(route, /selectedPeriod/)
  assert.match(route, /selectedDivision/)
  assert.doesNotMatch(route, /historical_player_name|source_player_id|source_url|raw_source|source_sha256|historical_monthly_import_id/)
  assert.match(route, /canonicalPlayerId/)
})

test("public Monthly results use the approved artwork with compact default and expanding results", () => {
  assert.match(page, /ArtworkNavigation/)
  assert.match(page, /monthlyArtwork/)
  assert.match(page, /metadataOnly=true/)
  assert.match(page, /emptyMonthlySelection/)
  assert.match(page, /initializeMonthlySelection/)
  assert.match(page, /shouldLoadMonthlyResults\(selection\)/)
  assert.match(page, /data-monthly-results=\"expanded\"/)
  assert.ok(page.indexOf("<ArtworkNavigation") < page.indexOf("data-monthly-results=\"expanded\""))
  assert.match(artworkMaps, /1629 \/ 966/)
  assert.match(artworkMaps, /monthly-results-approved\.png/)
  assert.doesNotMatch(artworkMaps, /monthly-results-approved\.jpg/)
  assert.match(artworkMaps, /title: "Krys Leagues Monthly Results"/)
  assert.match(page, /aria-label="Year"/)
  assert.match(page, /aria-label="Month"/)
  assert.match(page, /aria-label="Division"/)
  assert.equal((page.match(/styles\.monthValueMask/g) || []).length, 1)
  assert.equal((page.match(/styles\.divisionValueMask/g) || []).length, 1)
  assert.match(page, /styles\.artworkValueMask.*styles\.monthValueMask/)
  assert.match(page, /styles\.artworkValueMask.*styles\.divisionValueMask/)
  assert.doesNotMatch(page, />SEPTEMBER</)
  assert.doesNotMatch(page, />ELITE</)
  assert.match(page, /artworkSelectedValue/)
  assert.equal((page.match(/styles\.yearValueMask/g) || []).length, 1)
  assert.equal((page.match(/styles\.yearSelectedValue/g) || []).length, 3)
  assert.match(styles, /\.artworkSelectedValue\s*\{/)
  assert.match(styles, /\.yearValueMask\s*\{/)
  assert.match(styles, /\.artworkValueMask\s*\{/)
  assert.match(styles, /\.monthValueMask\s*\{/)
  assert.match(styles, /\.divisionValueMask\s*\{/)
  assert.match(styles, /\.yearSelectedValue\s*\{/)
  assert.match(page, /selection\.month \? monthNames\[selection\.month\] : ""/)
  assert.match(page, /selection\.division\}/)
  assert.match(styles, /padding-left: 28%/)
  assert.match(styles, /font-family: Arial, Helvetica, sans-serif/)
  assert.match(styles, /text-shadow: 0 0 8px/)
  assert.match(styles, /\.artworkSelectedValueLong\s*\{/)
  assert.match(page, /Overall standings/)
  assert.match(page, /Monthly overall standings/)
  assert.match(page, /Maps and course placements/)
  assert.match(page, /DifficultyTable/)
  assert.match(page, /Previous Month/)
  assert.match(route, /period\.year === requestedYear && period\.month === requestedMonth/)
  assert.match(page, /movePeriod\(1\)/)
  assert.match(page, /movePeriod\(-1\)/)
  assert.doesNotMatch(page, /All completed Monthly results/)
  assert.match(styles, /linear-gradient/)
  assert.match(styles, /#22d3ee|#ff22|#00eaff/i)
  assert.doesNotMatch(styles, /background:\s*#fff(?:fff)?\b/i)
})

test("Monthly filter state starts compact, uses dynamic divisions, and resets safely", () => {
  const periods: MonthlyPeriodOption[] = [
    { year: 2026, month: 7, divisions: ["Elite", "Master"] },
    { year: 2026, month: 6, divisions: ["Pro 1"] },
    { year: 2025, month: 12, divisions: ["Open"] },
  ]
  const initial = initializeMonthlySelection(periods)

  assert.deepEqual(initial, { year: 2026, month: "", division: "" })
  assert.equal(shouldLoadMonthlyResults(initial), false)
  assert.deepEqual(monthOptionsForYear(periods, initial.year), [6, 7])

  const monthSelected = resetAfterMonthChange(initial, 7)
  assert.deepEqual(divisionOptionsForSelection(periods, monthSelected), ["Elite", "Master"])
  assert.equal(shouldLoadMonthlyResults(monthSelected), false)

  const divisionSelected = { ...monthSelected, division: "Elite" }
  assert.equal(shouldLoadMonthlyResults(divisionSelected), true)
  assert.deepEqual(resetAfterYearChange(2025), { year: 2025, month: "", division: "" })
  assert.deepEqual(resetAfterMonthChange(divisionSelected, 6), { year: 2026, month: 6, division: "" })
  assert.deepEqual(selectionForPeriod(periods[1]), { year: 2026, month: 6, division: "" })
})

test("public Monthly endpoint gates rows behind a complete historical selection", () => {
  assert.match(route, /metadataOnly/)
  assert.match(route, /!metadataOnly && \(playerId \|\| \(selectedPeriod && selectedDivision\)\)/)
  assert.match(route, /selectedPeriod && !playerId \? \{ year: selectedPeriod\.year, month: selectedPeriod\.month, division: selectedDivision \}/)
  assert.doesNotMatch(route, /selectedPeriod\.divisions\[0\]/)
})

test("Player Profile loads Monthly history through the public canonical-player endpoint", () => {
  assert.match(profile, /\/api\/monthlies\/public\?playerId=/)
  assert.match(profile, /canonicalPlayerId/)
  assert.match(profile, /MonthlyPeriodCard/)
  assert.match(profile, /View Course Scores/)
  assert.match(profile, /overallPlacement/)
})
