import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createDoublesRuntimeClient } from "@/lib/doublesParticipantServer"

export async function GET() {
  const sessionClient = await createServerSupabaseClient()
  const session = await sessionClient.auth.getUser()
  if (!session.data.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const canonical = await sessionClient.rpc("current_user_canonical_player_id")
  const playerId = typeof canonical.data === "string" ? canonical.data : null
  if (canonical.error || !playerId) return NextResponse.json({ error: "Canonical player identity is not linked" }, { status: 403 })
  const client = createDoublesRuntimeClient()
  const memberships = await client.from("doubles_season_team_members").select("season_id,season_team_id,player_id,effective_from,effective_to").eq("player_id", playerId).eq("role", "member").order("season_id")
  if (memberships.error) return NextResponse.json({ error: "Doubles history is unavailable" }, { status: 503 })
  const teamIds = Array.from(new Set((memberships.data || []).map((row) => row.season_team_id)))
  if (!teamIds.length) return NextResponse.json({ player_id: playerId, memberships: [], teams: [], fixtures: [], standings: [] })
  const teams = await client.from("doubles_managed_season_teams").select("id,season_id,division,order_position,team_name_snapshot,status,global_team_id").in("id", teamIds)
  const fixtures = await client.from("doubles_managed_fixtures").select("*").or(`home_season_team_id.in.(${teamIds.join(",")}),away_season_team_id.in.(${teamIds.join(",")})`).order("game_number")
  const standings = await client.from("doubles_managed_standings").select("*").in("season_team_id", teamIds).order("rank")
  if (teams.error || fixtures.error || standings.error) return NextResponse.json({ error: "Doubles dashboard data is unavailable" }, { status: 503 })
  return NextResponse.json({ player_id: playerId, memberships: memberships.data || [], teams: teams.data || [], fixtures: fixtures.data || [], standings: standings.data || [] })
}
