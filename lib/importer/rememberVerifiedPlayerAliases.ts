import { normalizeIdentity } from "../identity/normalizeIdentity.ts"

export type VerifiedAliasMemoryDecision = {
  historicalDisplayName: string
  playerId: string | null
  playerScreenName: string | null
  explicitlyApproved: boolean
}

export type VerifiedAliasMemoryRequest = {
  p_player_id: string
  p_alias: string
}

export type VerifiedAliasMemoryRpcResult = {
  canonical_player_id: string
  alias: string
  normalized_alias: string
  verified: boolean
  idempotent: boolean
  status: "created" | "already_verified_same_identity"
}

export type VerifiedAliasMemoryFailure = {
  request: VerifiedAliasMemoryRequest
  message: string
}

export type VerifiedAliasMemorySummary = {
  created: number
  alreadyKnown: number
  conflicts: VerifiedAliasMemoryFailure[]
  failures: VerifiedAliasMemoryFailure[]
}

export function buildVerifiedAliasMemoryRequests(
  decisions: VerifiedAliasMemoryDecision[]
): VerifiedAliasMemoryRequest[] {
  const requests = new Map<string, VerifiedAliasMemoryRequest>()
  for (const decision of decisions) {
    const alias = decision.historicalDisplayName.trim()
    if (!decision.explicitlyApproved || !decision.playerId || !alias) continue
    if (decision.playerScreenName
      && normalizeIdentity(alias) === normalizeIdentity(decision.playerScreenName)) continue
    const key = `${decision.playerId}:${normalizeIdentity(alias)}`
    requests.set(key, { p_player_id: decision.playerId, p_alias: alias })
  }
  return Array.from(requests.values())
}

export async function rememberVerifiedPlayerAliases(
  requests: VerifiedAliasMemoryRequest[],
  callRpc: (request: VerifiedAliasMemoryRequest) => Promise<{
    data: VerifiedAliasMemoryRpcResult[] | VerifiedAliasMemoryRpcResult | null
    error: { code?: string; message: string } | null
  }>
): Promise<VerifiedAliasMemorySummary> {
  const summary: VerifiedAliasMemorySummary = {
    created: 0,
    alreadyKnown: 0,
    conflicts: [],
    failures: [],
  }
  for (const request of requests) {
    let response: Awaited<ReturnType<typeof callRpc>>
    try {
      response = await callRpc(request)
    } catch (error) {
      summary.failures.push({
        request,
        message: error instanceof Error ? error.message : "Identity-memory request failed.",
      })
      continue
    }
    const { data, error } = response
    if (error) {
      const failure = { request, message: error.message }
      if (error.code === "23505" || /different canonical|conflict/i.test(error.message)) {
        summary.conflicts.push(failure)
      } else {
        summary.failures.push(failure)
      }
      continue
    }
    const result = Array.isArray(data) ? data[0] : data
    if (!result) {
      summary.failures.push({ request, message: "Identity-memory RPC returned no result." })
    } else if (result.idempotent || result.status === "already_verified_same_identity") {
      summary.alreadyKnown += 1
    } else {
      summary.created += 1
    }
  }
  return summary
}
