import { createClient } from "@supabase/supabase-js"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

type PlayerMutationBody = {
  action?: "create" | "create_batch" | "update_status" | "add_league_membership" | "add_tournament_entry"
  screen_name?: string
  active?: boolean
  status?: string
  league_type?: string | null
  division?: string | null
  discord_id?: string | null
  discord_username?: string | null
  discord_avatar?: string | null
  players?: unknown
  player_id?: string
  player_name?: string
  season_number?: number
  tournament_type?: string
  bracket?: string
}

function trustedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Missing trusted Supabase server configuration")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function badRequest(error: string) {
  return Response.json({ error }, { status: 400, headers: { "Cache-Control": "no-store" } })
}

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const client = trustedClient()
  const params = new URL(request.url).searchParams
  const view = params.get("view")

  if (view === "players") {
    let query = client
      .from("players")
      .select("id, screen_name, discord_id, discord_name, discord_username, status, active, avatar_path, is_server_booster, has_krys_server_tag, profile_badges")
      .order("screen_name", { ascending: true })
    if (params.get("active") === "true") query = query.eq("active", true)
    if (params.get("ids")) query = query.in("id", params.get("ids")!.split(",").filter(Boolean))
    const result = await query
    if (result.error) return Response.json({ error: result.error.message }, { status: 503 })
    return Response.json({ players: result.data ?? [] }, { headers: { "Cache-Control": "no-store" } })
  }

  if (view === "directory") {
    const [players, links, aliases] = await Promise.all([
      client.from("players").select("id, screen_name, discord_id, discord_name, discord_username, status, active"),
      client.from("player_identity_links").select("historical_player_id, canonical_player_id"),
      client.from("player_aliases").select("player_id, alias, source").eq("verified", true).order("alias"),
    ])
    const error = players.error || links.error || aliases.error
    if (error) return Response.json({ error: error.message }, { status: 503 })
    return Response.json({ players: players.data ?? [], links: links.data ?? [], aliases: aliases.data ?? [] }, { headers: { "Cache-Control": "no-store" } })
  }

  if (view === "profile") {
    const playerId = params.get("player_id")
    if (!playerId) return Response.json({ error: "player_id is required." }, { status: 400 })
    const [player, memberships, results] = await Promise.all([
      client.from("players").select("id, screen_name, discord_id, discord_name, discord_username, status, active").eq("id", playerId).maybeSingle(),
      client.from("player_league_memberships").select("id, league_type, season_number, division").eq("player_id", playerId).order("season_number", { ascending: false }),
      client.from("results").select("id, player1_id, player2_id, winner, is_draw").or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`),
    ])
    const error = player.error || memberships.error || results.error
    if (error) return Response.json({ error: error.message }, { status: 503 })
    return Response.json({ player: player.data, memberships: memberships.data ?? [], results: results.data ?? [] }, { headers: { "Cache-Control": "no-store" } })
  }

  if (view === "results") {
    let query = client.from("results").select("*")
    if (params.get("player_id")) query = query.or(`player1_id.eq.${params.get("player_id")},player2_id.eq.${params.get("player_id")}`)
    if (params.get("schedule_ids")) query = query.in("schedule_id", params.get("schedule_ids")!.split(",").filter(Boolean))
    if (params.get("league_type")) query = query.eq("league_type", params.get("league_type")!)
    if (params.get("division")) query = query.eq("division", params.get("division")!)
    if (params.get("season_number")) query = query.eq("season_number", Number(params.get("season_number")))
    if (params.get("game")) query = query.eq("game", Number(params.get("game")))
    const result = await query
    if (result.error) return Response.json({ error: result.error.message }, { status: 503 })
    return Response.json({ results: result.data ?? [] }, { headers: { "Cache-Control": "no-store" } })
  }

  if (view === "career") {
    const [players, results, memberships] = await Promise.all([
      client.from("players").select("id, screen_name, status, active").order("screen_name", { ascending: true }),
      client.from("results").select("id, player1_id, player2_id, winner, is_draw, league_type, division, season_number"),
      client.from("player_league_memberships").select("id, player_id, league_type, division, season_number"),
    ])
    const error = players.error || results.error || memberships.error
    if (error) return Response.json({ error: error.message }, { status: 503 })
    return Response.json({ players: players.data ?? [], results: results.data ?? [], memberships: memberships.data ?? [] }, { headers: { "Cache-Control": "no-store" } })
  }

  const [memberships, tournaments] = await Promise.all([
    client.from("player_league_memberships").select("player_id, league_type, season_number, division").order("season_number", { ascending: false }),
    client.from("player_tournament_entries").select("player_id, tournament_type, bracket, status").order("created_at", { ascending: false }),
  ])
  const error = memberships.error || tournaments.error
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ memberships: memberships.data ?? [], tournaments: tournaments.data ?? [] }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  let body: PlayerMutationBody
  try {
    body = (await request.json()) as PlayerMutationBody
  } catch {
    return badRequest("Invalid JSON body")
  }

  if (body.action === "create") {
    const { data, error } = await authorization.supabase.rpc("admin_create_player", {
      p_screen_name: body.screen_name,
      p_active: body.active ?? true,
      p_status: body.status ?? "active",
      p_league_type: body.league_type ?? null,
      p_division: body.division ?? null,
      p_discord_id: body.discord_id ?? null,
      p_discord_username: body.discord_username ?? null,
      p_discord_avatar: body.discord_avatar ?? null,
    })
    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ data }, { headers: { "Cache-Control": "no-store" } })
  }

  if (body.action === "create_batch") {
    if (!Array.isArray(body.players)) return badRequest("players must be an array")
    const { data, error } = await authorization.supabase.rpc("admin_create_players", {
      p_players: body.players,
    })
    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ data }, { headers: { "Cache-Control": "no-store" } })
  }

  if (body.action === "update_status") {
    if (!body.player_id || !body.status) return badRequest("player_id and status are required")
    const { data, error } = await authorization.supabase.rpc("admin_update_player_status", {
      p_player_id: body.player_id,
      p_status: body.status,
      p_active: body.active ?? body.status === "active",
    })
    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ data }, { headers: { "Cache-Control": "no-store" } })
  }

  if (body.action === "add_league_membership") {
    if (!body.player_id || !body.league_type || !body.division || !Number.isInteger(body.season_number)) return badRequest("player_id, league_type, division, and season_number are required")
    const client = trustedClient()
    const existing = await client.from("player_league_memberships").select("id").eq("player_id", body.player_id).eq("league_type", body.league_type).eq("season_number", body.season_number).eq("division", body.division)
    if (existing.error) return Response.json({ error: existing.error.message }, { status: 400 })
    if ((existing.data ?? []).length > 0) return Response.json({ error: "This player is already registered for this league division." }, { status: 409 })
    const result = await client.from("player_league_memberships").insert([{ player_id: body.player_id, league_type: body.league_type, season_number: body.season_number, division: body.division }])
    if (result.error) return Response.json({ error: result.error.message }, { status: 400 })
    return Response.json({ data: result.data ?? null }, { headers: { "Cache-Control": "no-store" } })
  }

  if (body.action === "add_tournament_entry") {
    if (!body.player_id || !body.player_name || !body.tournament_type || !body.bracket) return badRequest("player_id, player_name, tournament_type, and bracket are required")
    const client = trustedClient()
    const existing = await client.from("player_tournament_entries").select("id").eq("player_id", body.player_id).eq("tournament_type", body.tournament_type).eq("bracket", body.bracket).eq("status", "registered")
    if (existing.error) return Response.json({ error: existing.error.message }, { status: 400 })
    if ((existing.data ?? []).length > 0) return Response.json({ error: "This player is already registered for this tournament bracket." }, { status: 409 })
    const result = await client.from("player_tournament_entries").insert([{ player_id: body.player_id, player_name: body.player_name, tournament_type: body.tournament_type, bracket: body.bracket, status: "registered" }])
    if (result.error) return Response.json({ error: result.error.message }, { status: 400 })
    return Response.json({ data: result.data ?? null }, { headers: { "Cache-Control": "no-store" } })
  }

  return badRequest("Unsupported player mutation")
}
