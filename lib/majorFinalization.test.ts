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
