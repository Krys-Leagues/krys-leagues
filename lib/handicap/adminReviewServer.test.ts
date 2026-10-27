import assert from "node:assert/strict"
import test from "node:test"

import {
  HANDICAP_ADMIN_PRODUCTION_TABLES,
  HANDICAP_REVIEW_PERSISTENCE_TABLES,
  readHandicapAdminProductionData,
} from "./adminReviewRead.ts"

function mockClient(
  counts: Record<string, number | Error>,
  requested: string[],
) {
  return {
    from(table: string) {
      requested.push(table)
      return {
        async select(columns: string, options: { count: "exact"; head: true }) {
          assert.equal(columns, "*")
          assert.deepEqual(options, { count: "exact", head: true })
          const value = counts[table]
          if (value instanceof Error) return { count: null, error: value }
          return { count: value ?? 0, error: null }
        },
      }
    },
  }
}

test("admin production reader returns count-only metadata and no row contents", async () => {
  const requested: string[] = []
  const client = mockClient({ handicap_rounds: 10274, course_ratings: 32 }, requested)
  const result = await readHandicapAdminProductionData(client)

  assert.equal(result.legacy.handicap_rounds.count, 10274)
  assert.equal(result.legacy.course_ratings.count, 32)
  assert.equal(result.legacy.handicap_differentials.status, "AVAILABLE")
  assert.equal(result.persistence.handicap_rating_snapshots.status, "AVAILABLE")
  assert.equal(result.persistence.handicap_rating_snapshots.count, 0)
  assert.deepEqual(new Set(requested), new Set([
    ...HANDICAP_ADMIN_PRODUCTION_TABLES,
    ...HANDICAP_REVIEW_PERSISTENCE_TABLES,
  ]))
})

test("unreadable or absent tables fail closed without leaking database errors", async () => {
  const result = await readHandicapAdminProductionData(
    mockClient({ handicap_rounds: new Error("relation does not exist") }, []),
  )

  assert.deepEqual(result.legacy.handicap_rounds, { status: "UNAVAILABLE", count: null })
  assert.deepEqual(result.persistence.handicap_review_evidence, { status: "AVAILABLE", count: 0 })
})
