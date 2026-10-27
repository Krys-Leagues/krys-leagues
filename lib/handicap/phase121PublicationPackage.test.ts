import assert from "node:assert/strict"
import test from "node:test"

import { validatePhase121PublicationPackage, type Phase121PublicationPackage } from "./phase121PublicationPackage.ts"

const uuid = (n: string) => `00000000-0000-5000-8000-${n.padStart(12, "0")}`

function validPackage(): Phase121PublicationPackage {
  const rating = {
    snapshot_id: uuid("1"),
    course_id: "Example_easy",
    difficulty: "easy" as const,
    rating_confidence: "READY_CANDIDATE" as const,
    course_rating: -20,
    slope: 8.5,
    source_scope: "KWT_ONLY" as const,
    weekly_rows_used: 0 as const,
    publication_status: "UNPUBLISHED" as const,
    publication_approval: "PENDING_HUMAN_RATING_REVIEW" as const,
    formal_review_disposition: "ACCEPT_FOR_FORMAL_REVIEW",
    owner_rating_approval: "PENDING" as const,
    owner_rating_approval_basis: "No owner rating approval recorded",
    owner_rating_approval_date: null,
  }
  const indexes = Array.from({ length: 166 }, (_, index) => ({
    snapshot_id: uuid(String(index + 2)),
    calculation_run_id: uuid("900"),
    canonical_player_id: uuid(String(index + 1000)),
    source_round_ids: ["KWT|S1W1|1|EXE|1"],
    rating_snapshot_ids: [rating.snapshot_id],
    all_eligible_rating_snapshot_ids: [rating.snapshot_id],
    rating_version_ids: [rating.snapshot_id],
    differential_model_version: "krys-handicap-candidate-a-v1" as const,
    latest_ten_source_round_ids: ["KWT|S1W1|1|EXE|1"],
    best_five_source_round_ids: ["KWT|S1W1|1|EXE|1", "KWT|S1W2|1|EXE|2", "KWT|S1W3|1|EXE|3", "KWT|S1W4|1|EXE|4", "KWT|S1W5|1|EXE|5"],
    chronology_confidence: "OFFICIAL_KWT_SEQUENCE" as const,
    source_scope: "KWT_ONLY" as const,
    weekly_rows_used: 0 as const,
    owner_numeric_fairness_decision: "ACCEPTED" as const,
    owner_acceptance_scope: "NUMERIC_FAIRNESS_ONLY" as const,
    publication_decision: "PENDING_EXPLICIT_APPROVAL" as const,
    publication_status: "UNPUBLISHED" as const,
    resulting_index: index - 2.15,
  }))
  return {
    productionProject: "jfbndcwdsvsjgnzwvexp",
    calculationRunId: uuid("900"),
    ratings: Array.from({ length: 78 }, (_, index) => ({ ...rating, snapshot_id: uuid(String(index + 1)), course_id: `Example_${index}_easy` })),
    indexes,
    dispositions: Array.from({ length: 82 }, (_, index) => ({ snapshot_id: uuid(String(index + 1)), course_id: `Example_${index}`, formal_review_disposition: "ACCEPT_FOR_FORMAL_REVIEW" as const, formal_approval: "PENDING" as const, owner_approval_reviewer: "" as const, owner_approval_date: null, owner_approval_basis: "No owner rating approval recorded", publication_status: "UNPUBLISHED" as const })),
    approval: { decision: "NUMERIC_FAIRNESS_ACCEPTED", reviewers: ["Krys", "Tricky"], scope: "numeric fairness only; not blanket rating approval, identity approval, security approval, or publication approval" },
  }
}

test("Phase 121 package validates 166 UUID-bound unpublished indexes", () => {
  assert.equal(validatePhase121PublicationPackage(validPackage()), true)
})

test("Weekly evidence cannot enter personal index candidates", () => {
  const pkg = validPackage()
  const bad = { ...pkg, indexes: pkg.indexes.map((row, index) => index === 0 ? { ...row, weekly_rows_used: 1 as 0 } : row) }
  assert.throws(() => validatePhase121PublicationPackage(bad), /Weekly evidence entered index/)
})

test("missing rating references fail closed", () => {
  const pkg = validPackage()
  const bad = { ...pkg, indexes: pkg.indexes.map((row, index) => index === 0 ? { ...row, rating_snapshot_ids: [uuid("999999")] } : row) }
  assert.throws(() => validatePhase121PublicationPackage(bad), /unapproved rating/)
})

test("owner numeric acceptance cannot become publication approval", () => {
  const pkg = validPackage()
  const bad = { ...pkg, indexes: pkg.indexes.map((row, index) => index === 0 ? { ...row, publication_decision: "APPROVE" as "PENDING_EXPLICIT_APPROVAL" } : row) }
  assert.throws(() => validatePhase121PublicationPackage(bad), /publication was implicitly approved/)
})

test("owner rating approval remains separate from publication approval", () => {
  const pkg = validPackage()
  const approvedRating = {
    ...pkg.ratings[0],
    owner_rating_approval: "APPROVED_BY_KRYS" as const,
    owner_rating_approval_basis: "Owner-supplied Krys approval dated 2026-10-21",
    owner_rating_approval_date: "2026-10-21",
    publication_approval: "PENDING_EXPLICIT_PUBLICATION_APPROVAL" as const,
  }
  const approvedDisposition = {
    ...pkg.dispositions[0],
    formal_approval: "OWNER_APPROVED" as const,
    owner_approval_reviewer: "Krys" as const,
    owner_approval_date: "2026-10-21",
    owner_approval_basis: "Explicit owner rating approval; publication remains separately gated",
  }
  const checked = { ...pkg, ratings: [approvedRating, ...pkg.ratings.slice(1)], dispositions: [approvedDisposition, ...pkg.dispositions.slice(1)] }
  assert.equal(validatePhase121PublicationPackage(checked), true)
})
