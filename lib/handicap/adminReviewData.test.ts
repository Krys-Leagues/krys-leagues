import assert from "node:assert/strict"
import test from "node:test"

import {
  HANDICAP_ADMIN_COURSE_COVERAGE,
  HANDICAP_REVIEW_DATA_STATUS,
  OFFICIAL_HANDICAP_COURSE_BASES,
} from "./adminReviewData.ts"

test("admin review data exposes the complete 82-entry official catalog", () => {
  assert.equal(OFFICIAL_HANDICAP_COURSE_BASES.length, 41)
  assert.equal(HANDICAP_ADMIN_COURSE_COVERAGE.length, 82)
  assert.equal(new Set(HANDICAP_ADMIN_COURSE_COVERAGE.map((row) => row.code)).size, 82)
  assert.deepEqual(HANDICAP_REVIEW_DATA_STATUS.unratedCodes, ["BHE", "BHH", "GLE", "GLH"])
})

test("unrated entries never expose a simulated rating as approved", () => {
  const unrated = HANDICAP_ADMIN_COURSE_COVERAGE.filter((row) => row.ratingStatus === "UNRATED")
  assert.deepEqual(unrated.map((row) => row.code), ["BHE", "BHH", "GLE", "GLH"])
  assert.ok(unrated.every((row) => row.confidence === "INSUFFICIENT_SAMPLE"))
})

test("new verified evidence is distinguished from missing evidence", () => {
  const newer = HANDICAP_ADMIN_COURSE_COVERAGE.filter((row) => row.evidenceStatus === "NEW_VERIFIED_EVIDENCE")
  assert.deepEqual(newer.map((row) => [row.code, row.sampleSize, row.distinctPlayers]), [
    ["BHE", 2, 2], ["BHH", 3, 3], ["GLE", 7, 7], ["GLH", 3, 3],
  ])
  assert.ok(newer.every((row) => row.ratingStatus === "UNRATED" && row.confidence === "INSUFFICIENT_SAMPLE"))
})

test("local projection evidence is explicitly non-production", () => {
  const local = HANDICAP_ADMIN_COURSE_COVERAGE.filter((row) => row.evidenceStatus === "LOCAL_PROJECTION")
  assert.equal(local.length, 78)
  assert.equal(HANDICAP_REVIEW_DATA_STATUS.localProjectionIsApproved, false)
  assert.ok(local.every((row) => row.confidence === "PROVISIONAL_REVIEW"))
})
