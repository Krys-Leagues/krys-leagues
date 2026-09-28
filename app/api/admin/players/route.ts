import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

function createAdminDataClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Admin Global Players server access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  let adminDataClient
  try {
    adminDataClient = createAdminDataClient()
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Admin Global Players server access is not configured." }, { status: 503 })
  }

  const [playersResult, membershipsResult, tournamentsResult, identityLinksResult] = await Promise.all([
    adminDataClient
      .from("players")
      .select("id, screen_name, discord_id, discord_name, status, active, avatar_path, is_server_booster, has_krys_server_tag, profile_badges")
      .order("screen_name", { ascending: true }),
    adminDataClient
      .from("player_league_memberships")
      .select("player_id, league_type, season_number, division")
      .order("season_number", { ascending: false }),
    adminDataClient
      .from("player_tournament_entries")
      .select("player_id, tournament_type, bracket, status")
      .order("created_at", { ascending: false }),
    adminDataClient
      .from("player_identity_links")
      .select("historical_player_id, canonical_player_id"),
  ])

  const error = playersResult.error || membershipsResult.error || tournamentsResult.error || identityLinksResult.error
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({
    players: playersResult.data || [],
    leagueMemberships: membershipsResult.data || [],
    tournamentEntries: tournamentsResult.data || [],
    identityLinks: identityLinksResult.data || [],
  }, { headers: { "Cache-Control": "no-store" } })
}
