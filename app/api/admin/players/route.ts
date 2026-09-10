import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

type PlayerMutationBody = {
  action?: "create" | "create_batch" | "update_status"
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
}

function badRequest(error: string) {
  return Response.json({ error }, { status: 400, headers: { "Cache-Control": "no-store" } })
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

  return badRequest("Unsupported player mutation")
}
