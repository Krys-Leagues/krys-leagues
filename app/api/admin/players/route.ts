import { createClient } from "@supabase/supabase-js"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

function trustedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

  if (!url || !key) throw new Error("Missing trusted Supabase server configuration")

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const client = trustedClient()
  const view = new URL(request.url).searchParams.get("view")

  if (view === "import-sources") {
    const [schedule, handicap, career, existing] = await Promise.all([
      client.from("schedule").select("player1, player2"),
      client.from("handicap_rounds").select("player_name"),
      client.from("player_career_events").select("player_name"),
      client.from("players").select("screen_name"),
    ])

    const error = schedule.error || handicap.error || career.error || existing.error
    if (error) {
      return Response.json(
        { error: error.message },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      )
    }

    return Response.json(
      {
        schedule: schedule.data ?? [],
        handicap: handicap.data ?? [],
        career: career.data ?? [],
        existing: existing.data ?? [],
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  }

  if (view === "players") {
    const [players, identityLinks] = await Promise.all([
      client
        .from("players")
        .select(
          "id, screen_name, discord_id, discord_name, discord_username, status, active, avatar_path, is_server_booster, has_krys_server_tag, profile_badges",
        )
        .order("screen_name", { ascending: true }),
      client
        .from("player_identity_links")
        .select("historical_player_id, canonical_player_id"),
    ])

    const error = players.error || identityLinks.error
    if (error) {
      return Response.json(
        { error: error.message },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      )
    }

    return Response.json(
      {
        players: players.data ?? [],
        identityLinks: identityLinks.data ?? [],
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  }

  const [memberships, tournaments] = await Promise.all([
    client
      .from("player_league_memberships")
      .select("player_id, league_type, season_number, division")
      .order("season_number", { ascending: false }),
    client
      .from("player_tournament_entries")
      .select("player_id, tournament_type, bracket, status")
      .order("created_at", { ascending: false }),
  ])

  const error = memberships.error || tournaments.error
  if (error) {
    return Response.json(
      { error: error.message },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }

  return Response.json(
    {
      memberships: memberships.data ?? [],
      tournaments: tournaments.data ?? [],
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
