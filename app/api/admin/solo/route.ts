import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createAdminServiceClient } from "@/lib/admin/adminServiceClient"

export const runtime = "nodejs"
const RPCS = new Set(["delete_solo_score_attempt", "save_solo_card", "create_solo_season_with_roster", "update_solo_season_dates", "add_existing_player_to_solo_historical_pool", "add_existing_player_to_solo_pool", "approve_solo_roster_version", "create_solo_canonical_player", "save_solo_roster", "close_solo_week", "reopen_solo_week", "update_solo_week", "search_solo_historical_global_players", "search_solo_existing_global_players", "find_solo_historical_player_by_discord_id", "find_solo_player_by_discord_id"])

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    const body = await request.json() as Record<string, unknown>
    const action = String(body.action || "")
    if (action === "query") {
      const allowed = new Set(["seasons", "solo_roster_versions", "solo_player_pool", "players", "solo_roster_entries", "solo_weeks", "solo_live_best_attempts", "solo_score_attempts"])
      const table = String(body.table || "")
      if (!allowed.has(table)) return NextResponse.json({ error: "That Solo table is not in the approved admin contract." }, { status: 400 })
      const ops = (body.ops || {}) as Record<string, unknown>
      let query = createAdminServiceClient().from(table).select(String(ops.select || "*"), ops.options as never)
      for (const [column, value] of Object.entries((ops.eq || {}) as Record<string, unknown>)) query = query.eq(column, value)
      for (const [column, value] of Object.entries((ops.in || {}) as Record<string, unknown>)) query = query.in(column, value as unknown[])
      const order = ops.order as { column?: string; options?: { ascending?: boolean } } | undefined
      if (order?.column) query = query.order(order.column, order.options)
      const result = ops.single ? await query.maybeSingle() : await query
      if (result.error) throw result.error
      return NextResponse.json({ data: result.data }, { headers: { "Cache-Control": "no-store" } })
    }
    if (action === "season_load") {
      const result = await createAdminServiceClient().from("seasons").select("season_number,league_type,start_date,end_date").eq("id", String(body.seasonId || "")).maybeSingle()
      if (result.error) throw result.error
      return NextResponse.json({ data: result.data }, { headers: { "Cache-Control": "no-store" } })
    }
    const name = String(body.name || "")
    if (!RPCS.has(name)) return NextResponse.json({ error: "That Solo RPC is not in the approved admin contract." }, { status: 400 })
    const result = await authorization.supabase.rpc(name, (body.args || {}) as Record<string, unknown>)
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
    return NextResponse.json({ data: result.data }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Solo admin request failed." }, { status: 400 })
  }
}
