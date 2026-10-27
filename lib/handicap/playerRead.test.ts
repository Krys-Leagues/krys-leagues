import assert from "node:assert/strict"
import test from "node:test"
import { readCurrentPlayerHandicap } from "./playerRead.ts"

const playerId = "11111111-1111-4111-8111-111111111111"

function client(overrides: Record<string, unknown> = {}) {
  return {
    auth: { getUser: async () => ({ data: { user: {} }, error: null }) },
    rpc: async (name: string) => {
      if (name === "current_user_canonical_player_id") return { data: playerId, error: null }
      return { data: null, error: new Error("read contract not installed") }
    },
    ...overrides,
  }
}

test("no published row is presented as NOT_YET_PUBLISHED", async () => {
  const result = await readCurrentPlayerHandicap(client())
  assert.equal(result.status, "NOT_YET_PUBLISHED")
  assert.equal(result.index, null)
  assert.equal(result.history.length, 0)
})

test("published reads are identity-bound and preserve negative scores", async () => {
  const result = await readCurrentPlayerHandicap(client({
    rpc: async (name: string) => name === "current_user_canonical_player_id"
      ? { data: playerId, error: null }
      : {
        data: {
          canonical_player_id: playerId,
          screen_name: "Raccoons_whisker",
          handicap_index: 2.4,
          model_version: "krys-handicap-candidate-a-v1",
          calculation_run_id: "run-1",
          history: [{
            source_key: "KWT|event|player|BHE|1",
            played_at: "2026-10-20T00:00:00Z",
            course_id: "BHE",
            difficulty: "easy",
            score: -24,
            differential: 1.3,
            rating_version_id: "rating-1",
            model_version: "krys-handicap-candidate-a-v1",
            source_type: "KWT",
          }],
        },
        error: null,
      },
  }))
  assert.equal(result.status, "PUBLISHED")
  assert.equal(result.screenName, "Raccoons_whisker")
  assert.equal(result.history[0].score, -24)
})

test("Weekly rows are never exposed as personal history", async () => {
  const result = await readCurrentPlayerHandicap(client({
    rpc: async (name: string) => name === "current_user_canonical_player_id"
      ? { data: playerId, error: null }
      : {
        data: {
          canonical_player_id: playerId,
          screen_name: "Player",
          handicap_index: 1,
          model_version: "krys-handicap-candidate-a-v1",
          history: [{ source_key: "weekly", played_at: "2026-10-20", course_id: "BHE", difficulty: "easy", score: -20, differential: 2, rating_version_id: "r", model_version: "m", source_type: "THE_WEEKLY" }],
        },
        error: null,
      },
  }))
  assert.equal(result.status, "PUBLISHED")
  assert.equal(result.history.length, 0)
})
