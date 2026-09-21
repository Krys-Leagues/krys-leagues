import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createAdminServiceClient } from "@/lib/admin/adminServiceClient"

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const client = createAdminServiceClient()
  const requestBody = await request.json().catch(() => ({})) as { playerId?: string }
  if (requestBody.playerId) {
    const playerId = requestBody.playerId
    const [player, memberships, trophies, results] = await Promise.all([
      client.from("players").select("id, screen_name, discord_id, discord_name, discord_username, status, active").eq("id", playerId).maybeSingle(),
      client.from("player_league_memberships").select("id, league_type, season_number, division").eq("player_id", playerId).order("season_number", { ascending: false }),
      client.from("player_trophies").select("*").eq("player_id", playerId).order("created_at", { ascending: false }),
      client.from("results").select("id, player1_id, player2_id, winner, is_draw").or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`),
    ])
    const error = [player, memberships, trophies, results].find((item) => item.error)?.error
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ data: { player: player.data, memberships: memberships.data || [], trophies: trophies.data || [], results: results.data || [] } }, { headers: { "Cache-Control": "no-store" } })
  }
  const [players, results, memberships, trophies] = await Promise.all([
    client.from("players").select("id, screen_name, status, active").order("screen_name"),
    client.from("results").select("id, player1_id, player2_id, winner, is_draw, league_type, division, season_number"),
    client.from("player_league_memberships").select("id, player_id, league_type, division, season_number"),
    client.from("player_trophies").select("id, player_id, trophy_title, placement, event_name, division, season"),
  ])
  const error = [players, results, memberships, trophies].find((item) => item.error)?.error
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: { players: players.data || [], results: results.data || [], memberships: memberships.data || [], trophies: trophies.data || [] } }, { headers: { "Cache-Control": "no-store" } })
}
