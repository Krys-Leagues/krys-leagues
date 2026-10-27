export type PlayerHandicapStatus = "PUBLISHED" | "NOT_YET_PUBLISHED" | "UNAVAILABLE" | "UNAUTHENTICATED"

export type PlayerHandicapHistoryRow = Readonly<{
  sourceKey: string
  playedAt: string
  courseId: string
  difficulty: "easy" | "hard"
  score: number
  differential: number
  ratingVersionId: string
  modelVersion: string
}>

export type PlayerHandicapRead = Readonly<{
  status: PlayerHandicapStatus
  canonicalPlayerId: string | null
  screenName: string | null
  index: number | null
  modelVersion: string | null
  calculationRunId: string | null
  approvedAt: string | null
  history: readonly PlayerHandicapHistoryRow[]
  message: string
}>

type PlayerHandicapReadClient = {
  auth: {
    getUser(): PromiseLike<{ data: { user: unknown | null }; error: unknown }>
  }
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

type PublishedHandicapPayload = {
  canonical_player_id?: unknown
  screen_name?: unknown
  handicap_index?: unknown
  resulting_index?: unknown
  model_version?: unknown
  differential_model_version?: unknown
  calculation_run_id?: unknown
  approved_at?: unknown
  history?: unknown
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function notYetPublished(canonicalPlayerId: string | null): PlayerHandicapRead {
  return {
    status: "NOT_YET_PUBLISHED",
    canonicalPlayerId,
    screenName: null,
    index: null,
    modelVersion: null,
    calculationRunId: null,
    approvedAt: null,
    history: [],
    message: "No approved Handicap Index has been published for this player yet.",
  }
}

function unavailable(message = "Handicap information is temporarily unavailable."): PlayerHandicapRead {
  return {
    status: "UNAVAILABLE",
    canonicalPlayerId: null,
    screenName: null,
    index: null,
    modelVersion: null,
    calculationRunId: null,
    approvedAt: null,
    history: [],
    message,
  }
}

function normalizeHistory(value: unknown): readonly PlayerHandicapHistoryRow[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    const score = typeof row.score === "number" ? row.score : null
    const differential = typeof row.differential === "number" ? row.differential : null
    const sourceKey = typeof row.source_key === "string" ? row.source_key : null
    const playedAt = typeof row.played_at === "string" ? row.played_at : null
    const courseId = typeof row.course_id === "string" ? row.course_id : null
    const difficulty = row.difficulty === "easy" || row.difficulty === "hard" ? row.difficulty : null
    const ratingVersionId = typeof row.rating_version_id === "string" ? row.rating_version_id : null
    const modelVersion = typeof row.model_version === "string" ? row.model_version : null
    const sourceType = row.source_type
    if (sourceType === "THE_WEEKLY" || sourceType === "WEEKLY") return []
    if (score === null || differential === null || !sourceKey || !playedAt || !courseId || !difficulty || !ratingVersionId || !modelVersion) return []
    return [{ sourceKey, playedAt, courseId, difficulty, score, differential, ratingVersionId, modelVersion }]
  })
}

function normalizePublishedPayload(value: unknown, canonicalPlayerId: string): PlayerHandicapRead | null {
  const payload = (Array.isArray(value) ? value[0] : value) as PublishedHandicapPayload | null
  if (!payload || typeof payload !== "object") return null
  if (payload.canonical_player_id !== canonicalPlayerId || typeof payload.screen_name !== "string") return null
  const index = typeof payload.handicap_index === "number"
    ? payload.handicap_index
    : typeof payload.resulting_index === "number" ? payload.resulting_index : null
  if (index === null || !Number.isFinite(index)) return null
  const modelVersion = typeof payload.model_version === "string"
    ? payload.model_version
    : typeof payload.differential_model_version === "string" ? payload.differential_model_version : null
  if (!modelVersion) return null
  return {
    status: "PUBLISHED",
    canonicalPlayerId,
    screenName: payload.screen_name,
    index,
    modelVersion,
    calculationRunId: typeof payload.calculation_run_id === "string" ? payload.calculation_run_id : null,
    approvedAt: typeof payload.approved_at === "string" ? payload.approved_at : null,
    history: normalizeHistory(payload.history),
    message: "Calculated from an approved published Handicap Index.",
  }
}

/**
 * Reads only the current authenticated player's approved publication view.
 * It intentionally has no fallback to legacy tables, draft ratings, or local
 * projections. The RPC is a future guarded read contract; when it is absent or
 * returns no row, the player sees a safe unpublished state.
 */
export async function readCurrentPlayerHandicap(client: PlayerHandicapReadClient): Promise<PlayerHandicapRead> {
  const auth = await client.auth.getUser()
  if (auth.error || !auth.data.user) {
    return {
      ...unavailable("Sign in to view your Handicap information."),
      status: "UNAUTHENTICATED",
    }
  }

  const identity = await client.rpc("current_user_canonical_player_id")
  if (identity.error || typeof identity.data !== "string" || !UUID_PATTERN.test(identity.data)) return unavailable()
  const canonicalPlayerId = identity.data

  const published = await client.rpc("get_published_handicap_for_player", {
    p_player_id: canonicalPlayerId,
  })
  if (published.error) return notYetPublished(canonicalPlayerId)
  return normalizePublishedPayload(published.data, canonicalPlayerId) ?? notYetPublished(canonicalPlayerId)
}
