import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { normalizeOptionalSeasonId, validateDoublesPlayerIds, validateDoublesRequiredUuid, validateDoublesSeasonAssignment } from "@/lib/doublesTeamBuilder"

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const seasonId = normalizeOptionalSeasonId(new URL(request.url).searchParams.get("season_id"))
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
      const playerIds = validateDoublesPlayerIds(body.player_1_id, body.player_2_id)
      if (!playerIds.ok) return NextResponse.json({ error: playerIds.error }, { status: 400 })
      const { data, error } = await authorization.supabase.rpc("create_doubles_global_team", { p_name: body.name, p_player_1_id: playerIds.playerOneId, p_player_2_id: playerIds.playerTwoId })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ id: data })
    }
    if (body.action === "update_team") {
      const playerIds = validateDoublesPlayerIds(body.player_1_id, body.player_2_id)
      if (!playerIds.ok) return NextResponse.json({ error: playerIds.error }, { status: 400 })
      const { data, error } = await authorization.supabase.rpc("update_doubles_global_team", { p_team_id: body.team_id, p_name: body.name, p_player_1_id: playerIds.playerOneId, p_player_2_id: playerIds.playerTwoId })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ id: data })
    }
    if (body.action === "assign_season") {
      const seasonId = normalizeOptionalSeasonId(body.season_id)
      if (!seasonId) return NextResponse.json({ error: "Season ID is required for season assignment." }, { status: 400 })
      const assignment = validateDoublesSeasonAssignment({ globalTeamId: body.global_team_id, division: body.division, orderPosition: body.order_position })
      if (!assignment.ok) return NextResponse.json({ error: assignment.error }, { status: 400 })
      const season = validateDoublesRequiredUuid(seasonId, "Season ID")
      if (!season.ok) return NextResponse.json({ error: season.error }, { status: 400 })
      const { data, error } = await authorization.supabase.rpc("create_doubles_managed_season_team", { p_season_id: season.value, p_global_team_id: assignment.globalTeamId, p_division: assignment.division, p_order_position: assignment.orderPosition })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ id: data })
    }
    if (body.action === "replace_member") {
      const season = validateDoublesRequiredUuid(body.season_id, "Season ID")
      const seasonTeam = validateDoublesRequiredUuid(body.season_team_id, "Season team ID")
      if (!season.ok) return NextResponse.json({ error: season.error }, { status: 400 })
      if (!seasonTeam.ok) return NextResponse.json({ error: seasonTeam.error }, { status: 400 })
      const playerIds = validateDoublesPlayerIds(body.old_player_id, body.replacement_player_id)
      if (!playerIds.ok) return NextResponse.json({ error: playerIds.error }, { status: 400 })
      const { data, error } = await authorization.supabase.rpc("replace_doubles_season_member", { p_season_id: season.value, p_season_team_id: seasonTeam.value, p_old_player_id: playerIds.playerOneId, p_replacement_player_id: playerIds.playerTwoId, p_reason: body.reason })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ id: data })
    }
    return NextResponse.json({ error: "Unsupported Doubles roster action" }, { status: 400 })
  } catch {
    return NextResponse.json({ error: "Invalid Doubles roster request" }, { status: 400 })
  }
}
