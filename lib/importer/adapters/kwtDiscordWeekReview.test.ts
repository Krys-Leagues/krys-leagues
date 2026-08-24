import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { parseKwtSeason9DiscordEvidence, reconcileKwtDiscordIdentities } from "./kwtDiscordEvidence.ts"
import { buildKwtPersonWeekReview } from "./kwtDiscordWeekReview.ts"

const raw = fs.readFileSync(new URL("../../../docs/historical-sources/kwt/season-09-discord-evidence.txt", import.meta.url), "utf8")
const season = parseKwtSeason9DiscordEvidence(raw)
const unresolvedIdentities = reconcileKwtDiscordIdentities(season, [])

test("groups one historical person per week and keeps Finals separate", () => {
  const periods = buildKwtPersonWeekReview(season, unresolvedIdentities)
  assert.equal(periods.length, 13)
  assert.deepEqual(periods.slice(0, 12).map(period => period.week), [1,2,3,4,5,6,7,8,9,10,11,12])
  assert.equal(periods[12].periodKey, "finals")
  assert.equal(periods[12].label, "Season 9 Finals")
  assert.equal(periods[12].week, null)
})

test("repeated names remain visible in every applicable week", () => {
  const periods = buildKwtPersonWeekReview(season, unresolvedIdentities)
  const appearances = periods.filter(period => period.people.some(person => person.historicalName === "bigja33"))
  assert.ok(appearances.length > 1)
  assert.ok(appearances.every(period => period.people.filter(person => person.historicalName === "bigja33").length === 1))
})

test("one canonical UUID selection resolves every exact occurrence", () => {
  const assignments = { bigja33: [{ canonicalPlayerId: "11111111-1111-1111-1111-111111111111", canonicalPlayerName: "BIGJA" }] }
  const periods = buildKwtPersonWeekReview(season, unresolvedIdentities, assignments)
  const appearances = periods.flatMap(period => period.people.filter(person => person.historicalName === "bigja33"))
  assert.ok(appearances.length > 1)
  assert.ok(appearances.every(person => person.status === "resolved" && person.canonicalPlayerId === "11111111-1111-1111-1111-111111111111"))
})

test("conflicting manual assignments block every occurrence", () => {
  const assignments = { bigja33: [
    { canonicalPlayerId: "one", canonicalPlayerName: "One", periodKey: "week-1" },
    { canonicalPlayerId: "two", canonicalPlayerName: "Two", periodKey: "week-2" },
  ] }
  const periods = buildKwtPersonWeekReview(season, unresolvedIdentities, assignments)
  const appearances = periods.flatMap(period => period.people.filter(person => person.historicalName === "bigja33"))
  assert.ok(appearances.every(person => person.status === "conflict" && person.canonicalPlayerId === null))
})

test("unresolved and ambiguous people sort before resolved people", () => {
  const identities = reconcileKwtDiscordIdentities(season, [{ id: "stewie", screenName: "stewiestewie", verifiedAliases: [] }])
  const week1 = buildKwtPersonWeekReview(season, identities)[0]
  const firstResolved = week1.people.findIndex(person => person.status === "resolved")
  assert.ok(firstResolved > 0)
  assert.ok(week1.people.slice(0, firstResolved).every(person => person.status !== "resolved"))
})

test("Week 8 remains one event with six independent source sections", () => {
  const week8 = buildKwtPersonWeekReview(season, unresolvedIdentities).find(period => period.week === 8)!
  assert.equal(week8.sourceSectionCount, 6)
  assert.equal(season.events.filter(event => event.week === 8).length, 1)
})
