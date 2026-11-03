import { createServerSupabaseClient } from "@/lib/supabase/server"
import { formatGolfHandicapIndex } from "@/lib/handicap/indexDisplay"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type RouteContext = { params: Promise<{ id: string }> }

type PublicHandicapRpcPayload = {
  canonical_player_id: string
  screen_name: string
  resulting_index: number | null
  display_index: string
  handicap_status: "PROVISIONAL" | "OFFICIAL_ELIGIBLE"
  qualifying_card_count: number
  model_version: string
  effective_from: string
  published_at: string
  history: Array<{
    calculation_snapshot_id: string
    resulting_index: number | null
    display_index: string
    handicap_status: "PROVISIONAL" | "OFFICIAL_ELIGIBLE"
    qualifying_card_count: number
    effective_from: string
    published_at: string
  }>
}

function normalizePayload(value: unknown, requestedId: string): PublicHandicapRpcPayload | null {
  const payload = Array.isArray(value) ? value[0] : value
  if (payload === null || payload === undefined) return null
  if (typeof payload !== "object") throw new Error("Published Handicap response was invalid.")
  const candidate = payload as Partial<PublicHandicapRpcPayload>
  if (candidate.canonical_player_id !== requestedId || typeof candidate.screen_name !== "string") {
    throw new Error("Published Handicap identity response was invalid.")
  }
  if (!Array.isArray(candidate.history)) throw new Error("Published Handicap history response was invalid.")
  return {
    canonical_player_id: candidate.canonical_player_id,
    screen_name: candidate.screen_name,
    resulting_index: candidate.resulting_index ?? null,
    display_index: candidate.display_index || formatGolfHandicapIndex(candidate.resulting_index),
    handicap_status: candidate.handicap_status as PublicHandicapRpcPayload["handicap_status"],
    qualifying_card_count: Number(candidate.qualifying_card_count || 0),
    model_version: String(candidate.model_version || ""),
    effective_from: String(candidate.effective_from || ""),
    published_at: String(candidate.published_at || ""),
    history: candidate.history.map((entry) => ({
      calculation_snapshot_id: entry.calculation_snapshot_id,
      resulting_index: entry.resulting_index ?? null,
      display_index: entry.display_index || formatGolfHandicapIndex(entry.resulting_index),
      handicap_status: entry.handicap_status,
      qualifying_card_count: Number(entry.qualifying_card_count || 0),
      effective_from: String(entry.effective_from || ""),
      published_at: String(entry.published_at || ""),
    })),
  }
}

export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params
  if (!UUID_PATTERN.test(id)) return Response.json({ error: "Invalid player id." }, { status: 400 })

  try {
    const client = await createServerSupabaseClient()
    const { data, error } = await client.rpc("get_public_published_handicap_for_player", { p_player_id: id })
    if (error) throw error
    const latest = normalizePayload(data, id)
    if (!latest) return Response.json({ handicap: null }, { headers: { "Cache-Control": "no-store" } })
    return Response.json({
      handicap: latest,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Published Handicap could not be loaded."
    return Response.json({ error: message }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
