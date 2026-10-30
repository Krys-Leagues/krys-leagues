import assert from "node:assert/strict"
import test from "node:test"
import { summarizeMajorFinalizationField } from "./majorFinalization.ts"

const entries = [{ id: "main-1" }, { id: "main-2" }, { id: "secondary-1" }]
const weekend = [
  { entry_id: "main-1", competition_status: "main" as const },
  { entry_id: "main-2", competition_status: "main" as const },
  { entry_id: "secondary-1", competition_status: "secondary" as const },
]

test("Main and Secondary finalization summaries are independent", () => {
  const main = summarizeMajorFinalizationField("main", entries, weekend, [
    { entry_id: "main-1", weekend_field: "main", field_placement: 1, result_status: "completed", is_finalized: true },
    { entry_id: "main-2", weekend_field: "main", field_placement: null, result_status: "pending", is_finalized: false },
  ])
  const secondary = summarizeMajorFinalizationField("secondary", entries, weekend, [
    { entry_id: "secondary-1", weekend_field: "secondary", field_placement: null, result_status: "pending", is_finalized: false },
  ])

  assert.equal(main.totalEntries, 2)
  assert.equal(main.finalizedEntries, 1)
  assert.deepEqual(main.unresolvedEntryIds, ["main-2"])
  assert.equal(main.canFinalize, false)
  assert.equal(secondary.totalEntries, 1)
  assert.equal(secondary.canFinalize, false)
})

test("a completed Main Event with ties can be finalized without Secondary", () => {
  const summary = summarizeMajorFinalizationField("main", entries, weekend, [
    { entry_id: "main-1", weekend_field: "main", field_placement: 1, result_status: "completed", is_finalized: false },
    { entry_id: "main-2", weekend_field: "main", field_placement: 2, result_status: "completed", is_finalized: false },
  ])

  assert.equal(summary.canFinalize, true)
  assert.equal(summary.isFinalized, false)
})

test("withdrawn and did-not-finish records do not require invented placements", () => {
  const summary = summarizeMajorFinalizationField("main", entries, weekend, [
    { entry_id: "main-1", weekend_field: "main", field_placement: null, result_status: "withdrawn", is_finalized: false },
    { entry_id: "main-2", weekend_field: "main", field_placement: null, result_status: "did_not_finish", is_finalized: false },
  ])

  assert.equal(summary.canFinalize, true)
})

test("all classified Main Event entries are finalized, not only the VIP Top 10", () => {
  const allEntries = Array.from({ length: 57 }, (_, index) => ({ id: `entry-${index + 1}` }))
  const allMain = allEntries.map((entry) => ({ entry_id: entry.id, competition_status: "main" as const }))
  const allPlacements = allEntries.map((entry, index) => ({
    entry_id: entry.id,
    weekend_field: "main" as const,
    field_placement: index + 1,
    result_status: "completed" as const,
    is_finalized: false,
  }))

  const summary = summarizeMajorFinalizationField("main", allEntries, allMain, allPlacements)

  assert.equal(summary.totalEntries, 57)
  assert.equal(summary.toFinalizeEntries, 57)
  assert.equal(summary.entryIdsToFinalize.length, 57)
  assert.equal(summary.unresolvedClassificationEntryIds.length, 0)
  assert.equal(summary.canFinalize, true)
})

test("an unclassified entry blocks either field instead of being silently excluded", () => {
  const summary = summarizeMajorFinalizationField("main", entries, [
    { entry_id: "main-1", competition_status: "main" as const },
    { entry_id: "main-2", competition_status: "main" as const },
    { entry_id: "secondary-1", competition_status: "pending" as const },
  ], [
    { entry_id: "main-1", weekend_field: "main", field_placement: 1, result_status: "completed", is_finalized: false },
    { entry_id: "main-2", weekend_field: "main", field_placement: 2, result_status: "completed", is_finalized: false },
  ])

  assert.deepEqual(summary.unresolvedClassificationEntryIds, ["secondary-1"])
  assert.equal(summary.toFinalizeEntries, 2)
  assert.equal(summary.isFinalized, false)
  assert.equal(summary.canFinalize, false)
})
