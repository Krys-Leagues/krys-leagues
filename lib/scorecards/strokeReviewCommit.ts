import type { ScorecardAdapterCommitPlan } from "./adapters/contracts"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ScorecardErrorDetails = {
  message: string
  code?: string
  status?: number
  stage?: string
}

export class ScorecardReviewError extends Error {
  readonly stage: string
  readonly code?: string
  readonly status?: number

  constructor(stage: string, error: unknown) {
    const details = describeScorecardError(error)
    super(details.message, error instanceof Error ? { cause: error } : undefined)
    this.name = "ScorecardReviewError"
    this.stage = stage
    this.code = details.code
    this.status = details.status
  }
}

export function describeScorecardError(error: unknown): ScorecardErrorDetails {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>
    const message = typeof record.message === "string" && record.message ? record.message : "Unknown scorecard error"
    return {
      message,
      ...(typeof record.code === "string" && record.code ? { code: record.code } : {}),
      ...(typeof record.status === "number" ? { status: record.status } : {}),
      ...(typeof record.stage === "string" && record.stage ? { stage: record.stage } : {}),
    }
  }
  return { message: error instanceof Error ? error.message : String(error || "Unknown scorecard error") }
}

export function normalizeOptionalScorecardUuid(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim() : ""
  if (!normalized) return null
  if (!UUID.test(normalized)) throw new Error("Invalid optional scorecard UUID")
  return normalized
}

export function toSharedScorecardRpcHoles(holes: Array<{ holeNumber: number; par: number; strokes: number }>) {
  return holes.map((hole) => ({
    hole_number: hole.holeNumber,
    par: hole.par,
    strokes: hole.strokes,
  }))
}

type RpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

export async function commitStrokeLeaguePlan(options: {
  serviceClient: RpcClient
  actorClient: RpcClient
  plan: ScorecardAdapterCommitPlan
  commitId: string
}) {
  let stage = "result_writer"
  try {
    const { rpc: resultRpc, ...resultArgs } = options.plan.resultPayload
    const result = await options.actorClient.rpc(String(resultRpc), resultArgs)
    if (result.error) throw new ScorecardReviewError(stage, result.error)

    if (options.plan.standingsRefresh) {
      stage = "standings_refresh"
      const { rpc: standingsRpc, ...standingsArgs } = options.plan.standingsRefresh
      const standings = await options.actorClient.rpc(String(standingsRpc), standingsArgs)
      if (standings.error) throw new ScorecardReviewError(stage, standings.error)
    }

    stage = "verification_complete"
    const completed = await options.serviceClient.rpc("complete_shared_scorecard_verification_service", {
      p_commit_id: options.commitId,
      p_succeeded: true,
      p_result_payload: { adapter: options.plan.adapterKey, source_key: options.plan.sourceKey },
      p_error_message: null,
    })
    if (completed.error || completed.data !== true) {
      throw new ScorecardReviewError(stage, completed.error || new Error("SCORECARD_VERIFICATION_COMPLETE_FAILED"))
    }
  } catch (error) {
    const failure = error instanceof ScorecardReviewError ? error : new ScorecardReviewError(stage, error)
    const rollback = await options.serviceClient.rpc("complete_shared_scorecard_verification_service", {
      p_commit_id: options.commitId,
      p_succeeded: false,
      p_result_payload: {},
      p_error_message: "League adapter commit failed; review remains open for retry.",
    })
    if (rollback.error) {
      const details = describeScorecardError(rollback.error)
      console.error("[admin/scorecards] verification rollback failed", {
        stage: "verification_rollback",
        code: details.code,
        message: details.message,
      })
    }
    throw failure
  }
}
