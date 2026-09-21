import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createAdminServiceClient } from "@/lib/admin/adminServiceClient"

export const runtime = "nodejs"

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const client = createAdminServiceClient()
    const [players, members] = await Promise.all([
      client.from("players").select("id, screen_name, discord_id").eq("active", true).is("discord_id", null).order("screen_name"),
      client.from("discord_members").select("id, discord_id, discord_name, player_id").is("player_id", null).order("discord_name"),
    ])
    if (players.error) throw players.error
    if (members.error) throw members.error
    return json({ players: players.data || [], members: members.data || [] })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Player matching data could not be loaded." }, 503)
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const body = await request.json() as Record<string, unknown>
    if (body.action !== "link_discord_identity") return json({ error: "Unsupported player matching action." }, 400)
    const playerId = String(body.playerId || "").trim()
    const discordId = String(body.discordId || "").trim()
    const discordName = String(body.discordName || "").trim()
    if (!playerId || !discordId || !discordName) return json({ error: "Player and Discord identity are required." }, 400)
    const result = await authorization.supabase.rpc("set_site_player_discord_identity", {
      p_player_id: playerId,
      p_discord_id: discordId,
      p_discord_name: discordName,
    })
    if (result.error) throw result.error
    return json({ data: Array.isArray(result.data) ? result.data[0] : result.data })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Discord identity could not be linked." }, 400)
  }
}
