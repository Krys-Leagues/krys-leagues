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
    const [players, waitlist] = await Promise.all([
      client.from("player_tracker").select("*").order("screen_name"),
      client.from("player_waitlist").select("screen_name, discord_username, discord_id"),
    ])
    if (players.error) throw players.error
    if (waitlist.error) throw waitlist.error
    return json({ players: players.data || [], waitlist: waitlist.data || [] })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Player tracker could not be loaded." }, 503)
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    const body = await request.json() as Record<string, unknown>
    const action = String(body.action || "")
    const client = createAdminServiceClient()
    if (action === "create") {
      const player = body.player
      if (!player || typeof player !== "object") return json({ error: "Player is required." }, 400)
      const result = await client.from("player_tracker").insert(player)
      if (result.error) throw result.error
      return json({ ok: true })
    }
    if (action === "import_waitlist") {
      const rows = Array.isArray(body.players) ? body.players : []
      const result = await client.from("player_tracker").insert(rows)
      if (result.error) throw result.error
      return json({ ok: true, importedCount: rows.length })
    }
    if (action === "update") {
      const playerId = String(body.playerId || "").trim()
      const field = String(body.field || "").trim()
      const allowedFields = new Set(["status", "cup_tier", "best_bracket_round", "bracket_wins", "notes"])
      if (!playerId || !allowedFields.has(field)) return json({ error: "Unsupported player tracker update." }, 400)
      const result = await client.from("player_tracker").update({ [field]: body.value }).eq("id", playerId)
      if (result.error) throw result.error
      return json({ ok: true })
    }
    return json({ error: "Unsupported player tracker action." }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Player tracker action failed." }, 400)
  }
}
