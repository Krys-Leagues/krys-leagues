import assert from "node:assert/strict"
import test from "node:test"

import {
  commitStrokeLeaguePlan,
  normalizeOptionalScorecardUuid,
  ScorecardReviewError,
  toSharedScorecardRpcHoles,
} from "./strokeReviewCommit.ts"

const scheduleId = "00000000-0000-4000-8000-000000000010"
const seasonId = "00000000-0000-4000-8000-000000000063"

function plan() {
  return {
    adapterKey: "stroke" as const,
    sourceKey: scheduleId,
    resultPayload: {
      rpc: "save_stroke_result",
      p_schedule_id: scheduleId,
      p_player1_score: -4,
      p_player2_score: 2,
    },
    standingsRefresh: {
      rpc: "rebuild_stroke_standings",
      p_season_id: seasonId,
      p_division_number: 1,
    },
  }
}

function mockClient(handler: (name: string) => { data: unknown; error: unknown }) {
  const calls: string[] = []
  return {
    calls,
    rpc: async (name: string) => {
      calls.push(name)
      return handler(name)
    },
  }
}

test("optional scorecard UUIDs normalize blank values and preserve valid UUIDs", () => {
  assert.equal(normalizeOptionalScorecardUuid(""), null)
  assert.equal(normalizeOptionalScorecardUuid("   "), null)
  assert.equal(normalizeOptionalScorecardUuid(null), null)
  assert.equal(normalizeOptionalScorecardUuid(scheduleId), scheduleId)
  assert.throws(() => normalizeOptionalScorecardUuid("not-a-uuid"), /Invalid optional scorecard UUID/)
})

test("shared scorecard RPC holes use the database snake_case field name", () => {
  assert.deepEqual(toSharedScorecardRpcHoles([
    { holeNumber: 1, par: 4, strokes: 3 },
    { holeNumber: 18, par: 5, strokes: 4 },
  ]), [
    { hole_number: 1, par: 4, strokes: 3 },
    { hole_number: 18, par: 5, strokes: 4 },
  ])
})

test("Stroke commit uses the authenticated actor for result and standings exactly once", async () => {
  const actor = mockClient(() => ({ data: [{ result_id: "result-1" }], error: null }))
  const service = mockClient((name) => ({ data: name === "complete_shared_scorecard_verification_service", error: null }))

  await commitStrokeLeaguePlan({ serviceClient: service, actorClient: actor, plan: plan(), commitId: "00000000-0000-4000-8000-000000000011" })

  assert.deepEqual(actor.calls, ["save_stroke_result", "rebuild_stroke_standings"])
  assert.deepEqual(service.calls, ["complete_shared_scorecard_verification_service"])
})

test("Stroke result failure rolls verification back and does not refresh standings", async () => {
  const actor = mockClient((name) => name === "save_stroke_result"
    ? { data: null, error: { message: "Authentication is required to save a Stroke result", code: "42501", status: 401 } }
    : { data: null, error: null })
  const service = mockClient(() => ({ data: true, error: null }))

  await assert.rejects(
    commitStrokeLeaguePlan({ serviceClient: service, actorClient: actor, plan: plan(), commitId: "00000000-0000-4000-8000-000000000011" }),
    (error: unknown) => error instanceof ScorecardReviewError
      && error.stage === "result_writer"
      && error.code === "42501"
      && error.message === "Authentication is required to save a Stroke result",
  )
  assert.deepEqual(actor.calls, ["save_stroke_result"])
  assert.deepEqual(service.calls, ["complete_shared_scorecard_verification_service"])
})

test("a failed Stroke attempt remains retryable and a later retry commits once", async () => {
  let attempt = 0
  const actor = mockClient((name) => {
    if (name === "save_stroke_result" && attempt++ === 0) return { data: null, error: { message: "temporary result writer failure", code: "XX000" } }
    return { data: true, error: null }
  })
  const completionStates: unknown[] = []
  const service = {
    calls: [] as string[],
    rpc: async (name: string, args?: { p_succeeded?: unknown }) => {
      service.calls.push(name)
      if (name === "complete_shared_scorecard_verification_service") completionStates.push(args?.p_succeeded)
      return { data: true, error: null }
    },
  }

  await assert.rejects(commitStrokeLeaguePlan({ serviceClient: service, actorClient: actor, plan: plan(), commitId: "00000000-0000-4000-8000-000000000011" }))
  await commitStrokeLeaguePlan({ serviceClient: service, actorClient: actor, plan: plan(), commitId: "00000000-0000-4000-8000-000000000011" })

  assert.deepEqual(completionStates, [false, true])
  assert.deepEqual(actor.calls, ["save_stroke_result", "save_stroke_result", "rebuild_stroke_standings"])
})
