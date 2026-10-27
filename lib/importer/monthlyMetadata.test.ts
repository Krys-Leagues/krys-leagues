import assert from "node:assert/strict"
import test from "node:test"

import { parseOptionalMonthlyInteger } from "./monthlyMetadata.ts"

test("malformed optional Monthly metadata becomes typed null while preserving its raw token", () => {
  const anomalies: Parameters<typeof parseOptionalMonthlyInteger>[2] = []
  assert.equal(parseOptionalMonthlyInteger(".1", "hole_in_ones", anomalies), null)
  assert.equal(parseOptionalMonthlyInteger("190.1", "course_points", anomalies), null)
  assert.deepEqual(anomalies, [
    { field: "hole_in_ones", rawValue: ".1", reason: "NON_INTEGER_OPTIONAL_METADATA", handling: "TYPED_NULL_RAW_PRESERVED" },
    { field: "course_points", rawValue: "190.1", reason: "NON_INTEGER_OPTIONAL_METADATA", handling: "TYPED_NULL_RAW_PRESERVED" },
  ])
})

test("valid zero and signed optional Monthly metadata remain numeric", () => {
  const anomalies: Parameters<typeof parseOptionalMonthlyInteger>[2] = []
  assert.equal(parseOptionalMonthlyInteger("0", "hole_in_ones", anomalies), 0)
  assert.equal(parseOptionalMonthlyInteger("-12", "total_strokes", anomalies), -12)
  assert.equal(parseOptionalMonthlyInteger("", "course_points", anomalies), null)
  assert.deepEqual(anomalies, [])
})
