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
    const result = await createAdminServiceClient().from("player_waitlist").select("*").in("status", ["waiting", "pending"]).order("created_at", { ascending: false })
    if (result.error) throw result.error
    return json({ data: result.data || [] })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Waitlist could not be loaded." }, 503)
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    const body = await request.json() as Record<string, unknown>
    const id = String(body.id || "").trim()
    if (!id) return json({ error: "Waitlist record is required." }, 400)
    const client = createAdminServiceClient()
    if (body.action === "remove") {
      const result = await client.from("player_waitlist").delete().eq("id", id)
      if (result.error) throw result.error
      return json({ ok: true })
    }
    if (body.action === "approve") {
      const waitlist = await client.from("player_waitlist").select("screen_name, league_type, discord_id, discord_username, discord_avatar").eq("id", id).single()
      if (waitlist.error) throw waitlist.error
      const result = await client.from("players").insert({
        screen_name: waitlist.data.screen_name,
        league_type: waitlist.data.league_type || "match",
        division: String(body.division || "").trim(),
        discord_id: waitlist.data.discord_id,
        discord_username: waitlist.data.discord_username,
        discord_avatar: waitlist.data.discord_avatar,
      })
      if (result.error) throw result.error
      const deleted = await client.from("player_waitlist").delete().eq("id", id)
      if (deleted.error) throw deleted.error
      return json({ ok: true })
    }
    return json({ error: "Unsupported waitlist action." }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Waitlist action failed." }, 400)
  }
}
