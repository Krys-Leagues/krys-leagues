import { NextResponse } from "next/server"

import { createAdminDataClient } from "@/lib/adminDataServer"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  let adminDataClient
  try {
    adminDataClient = createAdminDataClient()
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Admin Global Players server access is not configured." }, { status: 503 })
  }

  const [playersResult, membershipsResult, tournamentsResult, identityLinksResult, aliasesResult] = await Promise.all([
    adminDataClient
      .from("players")
      .select("id, screen_name, discord_id, discord_name, discord_username, discord_avatar, status, active, division, avatar_path, is_server_booster, has_krys_server_tag, profile_badges")
      .order("screen_name", { ascending: true }),
    adminDataClient
      .from("player_league_memberships")
      .select("id, player_id, league_type, season_number, division")
      .order("season_number", { ascending: false }),
    adminDataClient
      .from("player_tournament_entries")
      .select("player_id, tournament_type, bracket, status")
      .order("created_at", { ascending: false }),
    adminDataClient
      .from("player_identity_links")
      .select("historical_player_id, canonical_player_id"),
    adminDataClient
      .from("player_aliases")
      .select("player_id, alias, source")
      .eq("verified", true)
      .order("alias", { ascending: true }),
  ])

  const error = playersResult.error || membershipsResult.error || tournamentsResult.error || identityLinksResult.error || aliasesResult.error
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({
    players: playersResult.data || [],
    leagueMemberships: membershipsResult.data || [],
    tournamentEntries: tournamentsResult.data || [],
    identityLinks: identityLinksResult.data || [],
    aliases: aliasesResult.data || [],
  }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const body = await request.json().catch(() => null) as { screenName?: unknown } | null
  const screenName = typeof body?.screenName === "string" ? body.screenName.trim() : ""
  if (!screenName) return Response.json({ error: "Screen name is required" }, { status: 400 })

  const { data, error } = await authorization.supabase.rpc("admin_create_player", { p_screen_name: screenName })
  if (error) return Response.json({ error: error.message }, { status: 400 })

  const player = Array.isArray(data) ? data[0] : data
  return Response.json({ player }, { headers: { "Cache-Control": "no-store" } })
}
