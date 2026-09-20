import assert from "node:assert/strict"
import test from "node:test"
import { classifyDuplicateCard, courseChallengeUsageKey, existingUsageKeys, type CourseChallengeCardUsage } from "./duplicateUsage.ts"

const base: CourseChallengeCardUsage = {
  id: "card-current",
  playerId: "player-1",
  courseSlug: "tourist-trap",
  challengeKey: "level",
  level: 1,
  aceStage: 1,
  difficulty: "Easy",
  status: "needs_review",
}

function card(overrides: Partial<CourseChallengeCardUsage>): CourseChallengeCardUsage {
  return { ...base, ...overrides }
}

test("new Level-only card has one Level usage target", () => {
  assert.equal(courseChallengeUsageKey(base), "level:tourist-trap:level-1:Easy")
  assert.deepEqual(existingUsageKeys(base), ["level:tourist-trap:level-1:Easy"])
})

test("new Ace-only card has one Ace usage target", () => {
  const ace = card({ challengeKey: "ace", level: 1, aceStage: 1 })
  assert.equal(courseChallengeUsageKey(ace), "ace:tourist-trap:stage-1")
  assert.deepEqual(existingUsageKeys(ace), ["ace:tourist-trap:stage-1"])
})

test("one verified Level card may carry both Level and Ace usage", () => {
  assert.deepEqual(existingUsageKeys(card({ status: "approved", aceCrossCredited: true })), [
    "level:tourist-trap:level-1:Easy",
    "ace:tourist-trap:stage-1",
  ])
})

test("card already used for Level may later be evaluated for Ace", () => {
  const result = classifyDuplicateCard(
    card({ challengeKey: "ace", status: "needs_review" }),
    card({ id: "level-approved", status: "approved", aceCrossCredited: false }),
  )
  assert.equal(result.disposition, "allowed_cross_track")
  assert.equal(result.blocking, false)
})

test("card already used for Ace may later be used for a legitimate Level", () => {
  const result = classifyDuplicateCard(
    base,
    card({ id: "ace-approved", challengeKey: "ace", status: "approved" }),
  )
  assert.equal(result.disposition, "allowed_cross_track")
  assert.equal(result.blocking, false)
})

test("same card reused for the same Level target is blocked", () => {
  const result = classifyDuplicateCard(base, card({ id: "same-level-target", status: "approved" }))
  assert.equal(result.disposition, "blocked_same_track")
  assert.equal(result.blocking, true)
})

test("same card reused for the same Ace target is blocked", () => {
  const result = classifyDuplicateCard(
    card({ challengeKey: "ace", status: "needs_review" }),
    card({ id: "same-ace-target", challengeKey: "ace", status: "approved" }),
  )
  assert.equal(result.disposition, "blocked_same_track")
  assert.equal(result.blocking, true)
})

test("same card reused for an Ace stage already credited by a Level card is blocked", () => {
  const result = classifyDuplicateCard(
    card({ challengeKey: "ace" }),
    card({ id: "level-with-ace", status: "approved", aceCrossCredited: true }),
  )
  assert.equal(result.disposition, "blocked_same_track")
  assert.equal(result.blocking, true)
})

test("repeated usage-key evaluation is idempotent", () => {
  const keys = existingUsageKeys(card({ status: "approved", aceCrossCredited: true }))
  assert.deepEqual([...new Set([...keys, ...keys])], keys)
})

test("legitimate cross-track reuse is never labeled blocking", () => {
  const result = classifyDuplicateCard(
    card({ challengeKey: "ace" }),
    card({ id: "level-approved", status: "approved" }),
  )
  assert.equal(result.disposition, "allowed_cross_track")
  assert.equal(result.blocking, false)
})

test("unapproved duplicates remain review information and identity mismatches remain blocked", () => {
  assert.equal(classifyDuplicateCard(base, card({ id: "pending", status: "needs_review" })).blocking, false)
  assert.equal(classifyDuplicateCard(base, card({ id: "other-player", playerId: "player-2", status: "approved" })).blocking, true)
})
