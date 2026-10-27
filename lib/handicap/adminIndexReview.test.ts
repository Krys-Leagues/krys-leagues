import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

import { buildAdminIndexReviewRows, filterAdminIndexReviewRows, parsePhase104IndexSnapshotCsv, sortAdminIndexReviewRows, summarizeAdminIndexReview, type AdminIndexReviewInput } from "./adminIndexReview.ts"

function candidate(index: number, overrides: Partial<AdminIndexReviewInput> = {}): AdminIndexReviewInput {
  return {
    id: `index-${index}`,
    calculationRunId: "3973f8e7-f2c9-5d05-bdb7-e49810713612",
    canonicalPlayerId: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
    originalScreenName: `Player ${index}`,
    canonicalScreenName: `Player ${index}`,
    sourceRoundIds: ["KWT|S1W01|player|TTE|1", "KWT|S1W01|player|TTH|2"],
    ratingSnapshotIds: ["rating-1"],
    ratingVersionIds: ["rating-1"],
    latestTenSourceRoundIds: ["KWT|S1W01|player|TTE|1", "KWT|S1W01|player|TTH|2"],
    bestFiveSourceRoundIds: ["KWT|S1W01|player|TTE|1", "KWT|S1W01|player|TTH|2", "KWT|S1W02|player|TTE|3", "KWT|S1W02|player|TTH|4", "KWT|S1W03|player|TTE|5"],
    resultingIndex: index % 2 ? -2.15 : 4.27,
    chronologyConfidence: "OFFICIAL_KWT_SEQUENCE",
    publicationStatus: "UNPUBLISHED",
    ...overrides,
  }
}

test("the admin review table covers all 157 candidates and preserves unpublished status", () => {
  const rows = buildAdminIndexReviewRows(Array.from({ length: 157 }, (_, index) => candidate(index + 1)))
  const summary = summarizeAdminIndexReview(rows)
  assert.equal(rows.length, 157)
  assert.equal(summary.total, 157)
  assert.equal(summary.unpublished, 157)
  assert.equal(summary.readyForExplicitApproval, 157)
  assert.equal(rows[0].storedIndex, -2.15)
  assert.equal(rows[0].displayedIndex, "+2.15")
  assert.equal(rows[0].qualifyingRoundCount, 2)
  assert.equal(rows[0].latestTenRoundCount, 2)
  assert.equal(rows[0].bestFiveRoundCount, 5)
})

test("missing identity metadata and unsafe evidence are visible review flags", () => {
  const rows = buildAdminIndexReviewRows([candidate(1), candidate(2, {
    originalScreenName: null,
    canonicalScreenName: null,
    chronologyConfidence: "PERIOD_WINDOW",
    sourceRoundIds: ["THE_WEEKLY|S1W01|player|TTE|1"],
    bestFiveSourceRoundIds: [],
  })])
  const flagged = rows.find((row) => row.canonicalPlayerId.endsWith("000000000002"))!
  assert.ok(flagged.reviewFlags.includes("CANONICAL_SCREEN_NAME_UNRESOLVED"))
  assert.equal(flagged.reviewStatus, "REVIEW_REQUIRED")
  assert.ok(flagged.reviewFlags.includes("UNSUPPORTED_CHRONOLOGY"))
  assert.ok(flagged.reviewFlags.includes("NON_KWT_SOURCE_ROUND"))
  assert.ok(flagged.reviewFlags.includes("INVALID_BEST_FIVE"))
})

test("review rows never convert stored indexes or approval state", () => {
  const row = buildAdminIndexReviewRows([candidate(1, { resultingIndex: -0.004 })])[0]
  assert.equal(row.storedIndex, -0.004)
  assert.equal(row.displayedIndex, "0.00")
  assert.equal(row.publicationStatus, "UNPUBLISHED")
})

test("the committed Phase 104 package parses into the complete 157-row review table", async () => {
  const csv = await readFile("docs/handicap/phase104/index_snapshot_import_rows.csv", "utf8")
  const rows = buildAdminIndexReviewRows(parsePhase104IndexSnapshotCsv(csv))
  const summary = summarizeAdminIndexReview(rows)
  assert.equal(rows.length, 157)
  assert.equal(summary.unpublished, 157)
  assert.equal(summary.reviewRequired, 157)
  assert.ok(rows.every((row) => row.reviewFlags.includes("CANONICAL_SCREEN_NAME_UNRESOLVED")))
  assert.ok(rows.every((row) => row.chronologyConfidence === "OFFICIAL_KWT_SEQUENCE"))
})

test("named review sorting uses the stored signed value and filtering is deterministic", () => {
  const rows = buildAdminIndexReviewRows([
    candidate(1, { canonicalScreenName: "Zed", resultingIndex: -2.15 }),
    candidate(2, { canonicalScreenName: "Ada", resultingIndex: 4.27 }),
    candidate(3, { canonicalScreenName: "Mia", resultingIndex: 0 }),
  ])
  assert.deepEqual(sortAdminIndexReviewRows(rows, "screen_name", "asc").map((row) => row.canonicalScreenName), ["Ada", "Mia", "Zed"])
  assert.deepEqual(sortAdminIndexReviewRows(rows, "stored_index", "asc").map((row) => row.storedIndex), [-2.15, 0, 4.27])
  assert.deepEqual(filterAdminIndexReviewRows(rows, "negative").map((row) => row.storedIndex), [-2.15])
})
