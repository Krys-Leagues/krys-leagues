import { NextResponse } from "next/server"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export const runtime = "nodejs"

const PLAYER_FIELDS = "id, screen_name, discord_id, discord_name, status, active, avatar_path, is_server_booster, has_krys_server_tag, profile_badges"

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
})

function createAdminDataClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Global Players server access is not configured.")

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function normalizedName(value: unknown) {
  return String(value || "").trim().toLowerCase()
}

function requiredString(value: unknown, label: string) {
  const result = String(value || "").trim()
  if (!result) throw new Error(`${label} is required.`)
  return result
}

async function loadDirectory(client: SupabaseClient) {
  const [playersResult, membershipsResult, tournamentsResult, identityLinksResult] = await Promise.all([
    client
      .from("players")
      .select(PLAYER_FIELDS)
      .order("screen_name", { ascending: true }),
    client
      .from("player_league_memberships")
      .select("player_id, league_type, season_number, division")
      .order("season_number", { ascending: false }),
    client
      .from("player_tournament_entries")
      .select("player_id, tournament_type, bracket, status")
      .order("created_at", { ascending: false }),
    client
      .from("player_identity_links")
      .select("historical_player_id, canonical_player_id"),
  ])

  const error = playersResult.error || membershipsResult.error || tournamentsResult.error || identityLinksResult.error
  if (error) throw error

  return {
    players: playersResult.data || [],
    leagueMemberships: membershipsResult.data || [],
    tournamentEntries: tournamentsResult.data || [],
    identityLinks: identityLinksResult.data || [],
  }
}

async function importExistingPlayers(client: SupabaseClient) {
  const [scheduleResult, handicapResult, careerResult, existingResult] = await Promise.all([
    client.from("schedule").select("player1, player2"),
    client.from("handicap_rounds").select("player_name"),
    client.from("player_career_events").select("player_name"),
    client.from("players").select("screen_name"),
  ])

  const error = scheduleResult.error || handicapResult.error || careerResult.error || existingResult.error
  if (error) throw error

  const names = new Map<string, string>()
  const addName = (value: unknown) => {
    const name = String(value || "").trim()
    if (name && !names.has(normalizedName(name))) names.set(normalizedName(name), name)
  }

  for (const row of scheduleResult.data || []) {
    addName(row.player1)
    addName(row.player2)
  }
  for (const row of handicapResult.data || []) addName(row.player_name)
  for (const row of careerResult.data || []) addName(row.player_name)

  const existing = new Set((existingResult.data || []).map((row) => normalizedName(row.screen_name)))
  const newPlayers = [...names.values()]
    .filter((name) => !existing.has(normalizedName(name)))
    .map((screenName) => ({ screen_name: screenName, active: true, status: "active" }))

  if (newPlayers.length > 0) {
    const insertResult = await client.from("players").insert(newPlayers)
    if (insertResult.error) throw insertResult.error
  }

  return { importedCount: newPlayers.length }
}

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    return json(await loadDirectory(createAdminDataClient()))
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Global Players could not be loaded." }, 503)
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const body = await request.json() as Record<string, unknown>
    const action = requiredString(body.action, "Action")
    const client = createAdminDataClient()

    if (action === "create_player") {
      const screenName = requiredString(body.screenName, "Player name")
      const existingResult = await client.from("players").select("screen_name")
      if (existingResult.error) throw existingResult.error
      if ((existingResult.data || []).some((row) => normalizedName(row.screen_name) === normalizedName(screenName))) {
        return json({ error: "Player already exists." }, 409)
      }

      const result = await client.from("players").insert({ screen_name: screenName, active: true, status: "active" })
      if (result.error) throw result.error
      return json({ ok: true })
    }

    if (action === "update_status") {
      const playerId = requiredString(body.playerId, "Player ID")
      const status = requiredString(body.status, "Player status")
      const result = await client
        .from("players")
        .update({ status, active: status === "active" })
        .eq("id", playerId)
      if (result.error) throw result.error
      return json({ ok: true })
    }

    if (action === "add_league_membership") {
      const playerId = requiredString(body.playerId, "Player ID")
      const leagueType = requiredString(body.leagueType, "League")
      const seasonNumber = Number(body.seasonNumber)
      const division = requiredString(body.division, "Division")
      if (!Number.isInteger(seasonNumber)) throw new Error("Season number is required.")

      const existingResult = await client
        .from("player_league_memberships")
        .select("id")
        .eq("player_id", playerId)
        .eq("league_type", leagueType)
        .eq("season_number", seasonNumber)
        .eq("division", division)
      if (existingResult.error) throw existingResult.error
      if ((existingResult.data || []).length > 0) return json({ error: "This player is already registered for that league division." }, 409)

      const result = await client.from("player_league_memberships").insert({
        player_id: playerId,
        league_type: leagueType,
        season_number: seasonNumber,
        division,
      })
      if (result.error) throw result.error
      return json({ ok: true })
    }

    if (action === "add_tournament_entry") {
      const playerId = requiredString(body.playerId, "Player ID")
      const tournamentType = requiredString(body.tournamentType, "Tournament")
      const bracket = requiredString(body.bracket, "Bracket")
      const existingResult = await client
        .from("player_tournament_entries")
        .select("id")
        .eq("player_id", playerId)
        .eq("tournament_type", tournamentType)
        .eq("bracket", bracket)
        .eq("status", "registered")
      if (existingResult.error) throw existingResult.error
      if ((existingResult.data || []).length > 0) return json({ error: "This player is already registered for that tournament bracket." }, 409)

      const playerResult = await client.from("players").select("screen_name").eq("id", playerId).single()
      if (playerResult.error) throw playerResult.error
      const result = await client.from("player_tournament_entries").insert({
        player_id: playerId,
        player_name: playerResult.data.screen_name,
        tournament_type: tournamentType,
        bracket,
        status: "registered",
      })
      if (result.error) throw result.error
      return json({ ok: true })
    }

    if (action === "import_existing_players") {
      return json({ ok: true, ...(await importExistingPlayers(client)) })
    }

    return json({ error: "Unsupported Global Players action." }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Global Players action failed." }, 503)
  }
}
