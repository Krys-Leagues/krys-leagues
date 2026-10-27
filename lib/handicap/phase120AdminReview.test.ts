import assert from "node:assert/strict"
import test from "node:test"

import {
  PHASE120_COURSE_REVIEW,
  PHASE120_MOVEMENT_ROUNDS,
  PHASE120_PRELIMINARY_PLAYERS,
  PHASE120_REVIEW_METADATA,
} from "./phase120PreliminaryReview.ts"
import type { Phase120CourseReview, Phase120MovementRound } from "./phase120PreliminaryReview.ts"
import { formatGolfHandicapIndex } from "./indexDisplay.ts"
import { resolveCanonicalPlayerDisplayName } from "./adminIndexReview.ts"

test("Phase 120 package contains the complete 166-player preliminary review", () => {
  assert.equal(PHASE120_PRELIMINARY_PLAYERS.length, 166)
  assert.equal(new Set(PHASE120_PRELIMINARY_PLAYERS.map((row) => row.canonicalPlayerId)).size, 166)
  assert.equal(PHASE120_PRELIMINARY_PLAYERS.filter((row) => Math.abs(row.absoluteChange ?? 0) >= 1).length, 33)
  assert.ok(PHASE120_PRELIMINARY_PLAYERS.every((row) => row.status === "LOCAL_PREVIEW_ONLY"))
  assert.ok(PHASE120_PRELIMINARY_PLAYERS.every((row) => row.chronologyConfidence === "OFFICIAL_KWT_SEQUENCE"))
  assert.ok(PHASE120_PRELIMINARY_PLAYERS.every((row) => row.weeklyRowsUsed === 0))
})

test("Phase 120 supporting rounds remain KWT-only and preserve signed scores", () => {
  const playersWithRounds = Object.entries(PHASE120_MOVEMENT_ROUNDS) as readonly [string, readonly Phase120MovementRound[]][]
  assert.equal(playersWithRounds.length, 33)
  const rounds = playersWithRounds.flatMap(([, values]) => values)
  assert.equal(rounds.length, 606)
  assert.ok(rounds.every((row) => row.source !== "THE_WEEKLY"))
  assert.ok(rounds.some((row) => (row.score ?? 0) < 0))
  assert.ok(rounds.every((row) => row.chronology === "OFFICIAL_KWT_SEQUENCE"))
})

test("Phase 120 course review keeps the unrated and provisional boundaries", () => {
  const courses = PHASE120_COURSE_REVIEW as readonly Phase120CourseReview[]
  assert.equal(courses.length, 82)
  assert.equal(courses.filter((row) => row.confidence === "PROVISIONAL").length, 2)
  assert.equal(courses.filter((row) => row.courseId === "Gloop Lair_hard" && row.courseRating === null && row.weeklyRating === null).length, 1)
  assert.equal(PHASE120_REVIEW_METADATA.weeklyRowsUsedForIndexes, 0)
  assert.equal(PHASE120_REVIEW_METADATA.status, "PRELIMINARY_UNPUBLISHED")
})

test("preliminary display uses golf notation without changing signed values", () => {
  const negative = PHASE120_PRELIMINARY_PLAYERS.find((row) => row.revisedIndex !== null && row.revisedIndex < 0)
  assert.ok(negative)
  assert.equal(formatGolfHandicapIndex(negative.revisedIndex), negative.revisedGolfDisplay)
  assert.equal(formatGolfHandicapIndex(0), "0.00")
  assert.equal(formatGolfHandicapIndex(4.27), "4.27")
})

test("canonical UUID remains authoritative when a historical source name was changed", () => {
  const resolved = resolveCanonicalPlayerDisplayName("bigja33", "BIGJA")
  assert.equal(resolved.canonicalScreenName, "BIGJA")
  assert.equal(resolved.historicalSourceName, "bigja33")
  assert.equal(resolved.nameChanged, true)
})
