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

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const client = trustedClient()
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
