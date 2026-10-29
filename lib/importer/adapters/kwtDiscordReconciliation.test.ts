import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { parseKwtSeason9DiscordEvidence, reconcileKwtDiscordIdentities } from "./kwtDiscordEvidence.ts"
import { buildKwtPersonWeekReview } from "./kwtDiscordWeekReview.ts"
import { stageKwtDiscordEvidence } from "./kwtDiscordStaging.ts"
import { buildKwtWeeklyReconciliation, kwtFactRenderKey, kwtSeasonReviewDraftKey, parseKwtSeasonReviewDraft, reviewKwtFact } from "./kwtDiscordReconciliation.ts"

const raw = fs.readFileSync(new URL("../../../docs/historical-sources/kwt/season-09-discord-evidence.txt", import.meta.url), "utf8")
const season = parseKwtSeason9DiscordEvidence(raw, "season-nine-sha")
const unresolved = reconcileKwtDiscordIdentities(season, [])
const resolved = unresolved.map((identity, index) => ({ ...identity, status: "resolved" as const, canonicalPlayerId: `player-${index}`, canonicalPlayerName: `Player ${index}` }))
const staged = stageKwtDiscordEvidence(season, resolved)
const periods = buildKwtPersonWeekReview(season, resolved)

test("ordinary supported facts become Ready without individual decisions", () => {
  const review = buildKwtWeeklyReconciliation(periods, staged.facts, {}, [], staged.unknownFields)
  const ordinary = review.flatMap(period => period.facts).filter(fact => !fact.requiresDecision && fact.status !== "Duplicate" && fact.status !== "Existing")
  assert.ok(ordinary.length > 1000)
  assert.ok(ordinary.every(fact => fact.status === "Ready"))
})

test("known unusual Week 4 facts require decisions", () => {
  const week4 = buildKwtWeeklyReconciliation(periods, staged.facts, {}, [], staged.unknownFields).find(period => period.week === 4)!
  assert.ok(week4.exceptions.some(fact => /-28 Semi-Pro Hard/.test(fact.unusualReason ?? "")))
  assert.ok(week4.exceptions.some(fact => /Duck notation/.test(fact.unusualReason ?? "")))
  assert.equal(week4.reviewBlockers.decisionsComplete, false)
})

test("conflicts require a decision before becoming reviewable", () => {
  const conflict = { ...staged.facts[0], status: "conflict" as const }
  assert.equal(reviewKwtFact(conflict, {}).status, "Conflict")
  assert.equal(reviewKwtFact(conflict, { [conflict.sourceFingerprint]: "preserve" }).status, "Ready")
})

test("unknown player counts never become zero and do not block weekly approval", () => {
  const decisions = Object.fromEntries(staged.facts.filter(fact => fact.week === 4 && (/3\s*-\s*@zanetti\.4/i.test(fact.rawSourceText) || fact.payload.score === -28)).map(fact => [fact.sourceFingerprint, "preserve" as const]))
  const review = buildKwtWeeklyReconciliation(periods, staged.facts, decisions, [], staged.unknownFields)
  const week1 = review.find(period => period.week === 1)!
  assert.ok(week1.unknownFields.some(field => field.field === "playerCount" && field.reason === "not supplied"))
  assert.ok(week1.unknownFields.every(field => field.reason !== "0"))
  assert.equal(week1.canMarkReviewed, true)
})

test("Week 8 sections and Finals separation survive reconciliation", () => {
  const review = buildKwtWeeklyReconciliation(periods, staged.facts, {}, [], staged.unknownFields)
  assert.equal(review.find(period => period.week === 8)?.sourceSectionCount, 6)
  assert.equal(review.find(period => period.periodKey === "finals")?.week, null)
  assert.notEqual(review.find(period => period.periodKey === "week-12"), review.find(period => period.periodKey === "finals"))
})

test("source-SHA local draft round-trips across reload", () => {
  const draft = { assignments: { bigja33: [{ canonicalPlayerId: "uuid", canonicalPlayerName: "BIGJA" }] }, exceptionDecisions: { fact: "preserve" as const }, leftUnresolvedNames: ["missing"], reviewedPeriods: ["week-1"] }
  assert.deepEqual(parseKwtSeasonReviewDraft(JSON.stringify(draft)), draft)
  assert.match(kwtSeasonReviewDraftKey("abc"), /abc$/)
})

test("duplicate facts retain their fingerprint and receive unique render-only keys", () => {
  const duplicates = staged.facts.filter(fact => fact.status === "duplicate")
  assert.equal(duplicates.length, 2)
  assert.equal(duplicates[0].sourceFingerprint, duplicates[1].sourceFingerprint)
  assert.equal(duplicates[0].sourceSection, "Amateur")
  assert.deepEqual(duplicates[0].payload, { scope: "division", division: "Amateur", position: 7 })
  assert.notEqual(kwtFactRenderKey(duplicates[0], "week-9", "darlava", 0), kwtFactRenderKey(duplicates[1], "week-9", "darlava", 1))
})

test("review UI contains no historical Apply or Production fact write", () => {
  const component = fs.readFileSync(new URL("../../../app/admin/kwt-import/discord-season-9/KwtDiscordIdentityReview.tsx", import.meta.url), "utf8")
  assert.match(component, /Apply disabled/)
  assert.doesNotMatch(component, /\.insert\(|\.upsert\(|\.update\(|\.rpc\(/)
})
