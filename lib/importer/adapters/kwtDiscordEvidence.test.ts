import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import test from "node:test"
import { normalizeDiscordHistoricalName, parseKwtSeason9DiscordEvidence, reconcileKwtDiscordIdentities, summarizeKwtDiscordSeason } from "./kwtDiscordEvidence.ts"

const sourcePath = new URL("../../../docs/historical-sources/kwt/season-09-discord-evidence.txt", import.meta.url)
const bytes = fs.readFileSync(sourcePath)
const season = parseKwtSeason9DiscordEvidence(bytes.toString("utf8"), crypto.createHash("sha256").update(bytes).digest("hex"))

test("recognizes all Season 9 weeks, courses, and separate finals", () => {
  assert.equal(season.events.length, 12)
  assert.deepEqual(season.events.map(event => event.week), [1,2,3,4,5,6,7,8,9,10,11,12])
  assert.equal(season.events.find(event => event.week === 8)?.course, "ATLANTIS")
  assert.ok(season.finals.placements.length > 0)
})

test("preserves deep placements, ties, skipped positions, and overall separately", () => {
  const week1 = season.events[0]
  assert.ok(week1.placements.some(fact => fact.division === "Pro" && fact.position === 10 && fact.sourceHandle === "squeezyjibbz"))
  assert.equal(week1.placements.filter(fact => fact.division === "Amateur" && fact.position === 3).length, 2)
  assert.ok(week1.placements.some(fact => fact.scope === "overall" && fact.position === 10))
})

test("preserves direct promotions and source anomalies without correction", () => {
  const week4 = season.events.find(event => event.week === 4)!
  assert.ok(week4.promotions.some(fact => fact.sourceHandle === "kcrob" && fact.fromDivision === "Semi-Pro" && fact.destinationDivision === "Elite"))
  assert.match(week4.warnings.join(" "), /-28/)
})

test("preserves badge multiplicity, ace counts, unknown state, and raw notation", () => {
  const week1 = season.events[0]
  assert.ok(week1.badges.some(fact => fact.sourceHandle === "sweetpeach88" && fact.multiplicity === 2))
  assert.ok(week1.badges.some(fact => fact.type === "diamond" && fact.aceCount === 7 && fact.sourceHandle === "stewiestewie"))
  assert.equal(season.events.find(event => event.week === 2)?.badgeStatus.beetle, "unknown")
  assert.match(season.events.find(event => event.week === 4)!.warnings.join(" "), /multiplicity is not inferred/)
})

test("distinguishes an explicit badge zero from omitted evidence", () => {
  const explicitZero = parseKwtSeason9DiscordEvidence("SEASON 9 WEEK 1 — TEST\nBADGES\nDuck:\n0\nSEASON 9 FINAL RESULTS\nSEASON 9 COMPLETENESS")
  assert.equal(explicitZero.events[0].badgeStatus.duck, "explicit-zero")
  assert.equal(explicitZero.events[0].badgeStatus.beetle, "unknown")
})

test("keeps Week 8 as one event with multiple source sections", () => {
  const week8 = season.events.find(event => event.week === 8)!
  assert.ok(week8.sourceMessages.length > 1)
  assert.match(week8.warnings.join(" "), /do not split/)
})

test("preserves New Player annotations and special recognition", () => {
  const week9 = season.events.find(event => event.week === 9)!
  assert.deepEqual(week9.annotations.map(value => value.sourceHandle), ["abagofchip.", "darlava"])
  assert.ok(season.finals.recognitions.some(value => /11 weekly wins/.test(value.text)))
})

test("uses only the three explicit historical aliases", () => {
  const identities = reconcileKwtDiscordIdentities(season, [
    { id: "el", screenName: "El Jorge", verifiedAliases: [] },
    { id: "max", screenName: "Maximus", verifiedAliases: [] },
    { id: "shooter", screenName: "Shooter McGavin", verifiedAliases: [] },
    { id: "stewie", screenName: "StewieStewie", verifiedAliases: [] },
  ])
  assert.equal(identities.find(value => value.historicalName === "rimblas")?.canonicalPlayerId, "el")
  assert.equal(identities.find(value => value.historicalName === "harry2939")?.canonicalPlayerId, "max")
  assert.equal(identities.find(value => value.historicalName === "g8r4l")?.canonicalPlayerId, "shooter")
  assert.equal(identities.find(value => value.historicalName === "wvueers257585")?.canonicalPlayerId, null)
})

test("normalizes exactly one Discord marker while preserving punctuation", () => {
  assert.equal(normalizeDiscordHistoricalName("@chell1843"), "chell1843")
  assert.equal(normalizeDiscordHistoricalName(" @rubber_duck1791 "), "rubber_duck1791")
  assert.equal(normalizeDiscordHistoricalName("@@putty2754"), "@putty2754")
})

test("uses case-insensitive exact current-name, verified-alias, and former-name matches", () => {
  const reviewed = reconcileKwtDiscordIdentities(season, [
    { id: "current", screenName: "STEWIESTEWIE", verifiedAliases: [] },
    { id: "alias", screenName: "Current Putty", verifiedAliases: ["putty2754"], identityAliases: [{ name: "putty2754", source: "manual" }] },
    { id: "former", screenName: "Current Chelle", verifiedAliases: ["chell1843"], identityAliases: [{ name: "chell1843", source: "historical_alias" }] },
  ])
  assert.equal(reviewed.find(value => value.historicalName === "stewiestewie")?.matchSource, "Current name")
  assert.equal(reviewed.find(value => value.historicalName === "putty2754")?.matchSource, "Verified alias")
  assert.equal(reviewed.find(value => value.historicalName === "chell1843")?.matchSource, "Former name")
  const beforeAtRemoval = reconcileKwtDiscordIdentities(season, [{ id: "stewie", screenName: "STEWIESTEWIE", verifiedAliases: [] }], { removeLeadingAt: false })
  assert.equal(beforeAtRemoval.find(value => value.historicalName === "@stewiestewie")?.status, "unresolved")
})

test("groups repeated facts by one unique historical name and preserves raw source", () => {
  const reviewed = reconcileKwtDiscordIdentities(season, [])
  const bigja = reviewed.find(value => value.historicalName === "bigja33")!
  assert.ok(bigja.factCount > 1)
  assert.equal(reviewed.filter(value => value.historicalName === "bigja33").length, 1)
  assert.match(season.events[0].rawText, /@bigja33/)
})

test("reports missing and ambiguous identities without fuzzy punctuation guesses", () => {
  const reviewed = reconcileKwtDiscordIdentities(season, [
    { id: "one", screenName: "Shared", verifiedAliases: ["rubberduck1791"] },
    { id: "two", screenName: "Other", verifiedAliases: ["rubberduck1791"] },
    { id: "punctuation", screenName: "chell_1843", verifiedAliases: [] },
  ])
  assert.equal(reviewed.find(value => value.historicalName === "rubberduck1791")?.status, "ambiguous")
  assert.equal(reviewed.find(value => value.historicalName === "chell1843")?.status, "unresolved")
})

test("summary exposes every required reconciliation category", () => {
  const summary = summarizeKwtDiscordSeason(season)
  assert.equal(summary.weeks, 12)
  assert.equal(summary.finalsRecognized, true)
  assert.ok(summary.divisionPlacementFacts > 0)
  assert.ok(summary.overallPlacementFacts > 0)
  assert.ok(summary.bestEasyFacts > 0)
  assert.ok(summary.bestHardFacts > 0)
  assert.ok(summary.promotionFacts > 0)
})
