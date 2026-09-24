import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const seasonId = new URL(request.url).searchParams.get("season_id")
  const { data, error } = await authorization.supabase.rpc("list_doubles_admin_roster", { p_season_id: seasonId })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? { teams: [], seasonTeams: [], players: [] })
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    const body = await request.json()
    if (body.action === "create_team") {
      const { data, error } = await authorization.supabase.rpc("create_doubles_global_team", { p_name: body.name, p_player_1_id: body.player_1_id, p_player_2_id: body.player_2_id })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ id: data })
    }
    if (body.action === "update_team") {
      const { data, error } = await authorization.supabase.rpc("update_doubles_global_team", { p_team_id: body.team_id, p_name: body.name, p_player_1_id: body.player_1_id, p_player_2_id: body.player_2_id })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ id: data })
    }
    if (body.action === "assign_season") {
      const { data, error } = await authorization.supabase.rpc("create_doubles_managed_season_team", { p_season_id: body.season_id, p_global_team_id: body.global_team_id, p_division: body.division, p_order_position: body.order_position })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ id: data })
    }
    if (body.action === "replace_member") {
      const { data, error } = await authorization.supabase.rpc("replace_doubles_season_member", { p_season_id: body.season_id, p_season_team_id: body.season_team_id, p_old_player_id: body.old_player_id, p_replacement_player_id: body.replacement_player_id, p_reason: body.reason })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ id: data })
    }
    return NextResponse.json({ error: "Unsupported Doubles roster action" }, { status: 400 })
  } catch {
    return NextResponse.json({ error: "Invalid Doubles roster request" }, { status: 400 })
  }
}
