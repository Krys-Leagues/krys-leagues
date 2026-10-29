import "server-only"

import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createTrustedSupabaseClient } from "@/lib/supabase/trustedServer"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const sessionClient = await createServerSupabaseClient()
  const { data: userData } = await sessionClient.auth.getUser()
  if (!userData.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 })

  const dashboard = await sessionClient.rpc("get_current_user_dashboard_data")
  if (dashboard.error) return NextResponse.json({ error: dashboard.error.message }, { status: 503 })

  const payload = dashboard.data as {
    player?: { id: string; screen_name: string; status: string | null; active: boolean | null } | null
    identityIds?: string[]
    memberships?: unknown[]
    schedule?: Array<{ player1_id: string | null; player2_id: string | null }>
    results?: unknown[]
  } | null
  if (!payload?.player) return NextResponse.json({ error: "Your player identity is not linked yet." }, { status: 404 })

  const identityIds = [...new Set(payload.identityIds || [payload.player.id])]
  const client = createTrustedSupabaseClient()
  const opponentIds = [...new Set((payload.schedule || []).flatMap((match) => [match.player1_id, match.player2_id]).filter((id): id is string => typeof id === "string" && !identityIds.includes(id)))]
  const opponentNames: Array<[string, string]> = []
  for (const opponentId of opponentIds) {
    const resolved = await client.rpc("get_public_player_canonical_identity", { p_player_id: opponentId })
    const resolvedData = (Array.isArray(resolved.data) ? resolved.data[0] : resolved.data) as { canonical_player_id?: string } | null
    if (!resolvedData?.canonical_player_id) continue
    const opponent = await client.from("players").select("id, screen_name, status, active").eq("id", resolvedData.canonical_player_id).maybeSingle()
    if (opponent.data?.active === true && !["merged", "retired", "archived"].includes((opponent.data.status || "").trim().toLowerCase())) {
      opponentNames.push([opponentId, opponent.data.screen_name])
    }
  }

  return NextResponse.json({
    player: payload.player,
    identityIds,
    memberships: payload.memberships || [],
    schedule: payload.schedule || [],
    results: payload.results || [],
    opponentNames,
  }, { headers: { "Cache-Control": "no-store" } })
}
