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
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Protected administrator server access is not configured.",
    }, { status: 503 })
  }

  const { data, error } = await adminDataClient
    .from("player_waitlist")
    .select("id, player_id, screen_name, league_type, preferred_division, status, discord_id, discord_username, discord_avatar, notes, created_at")
    .in("status", ["waiting", "pending"])
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ waitlist: data || [] }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const body = await request.json().catch(() => null) as {
    action?: unknown
    waitlistId?: unknown
    division?: unknown
    seasonNumber?: unknown
  } | null
  const action = typeof body?.action === "string" ? body.action : ""
  const waitlistId = typeof body?.waitlistId === "string" ? body.waitlistId.trim() : ""
  if (!waitlistId) return NextResponse.json({ error: "Wait-list entry is required." }, { status: 400 })

  if (action === "approve") {
    const division = typeof body?.division === "string" ? body.division.trim() : ""
    const seasonNumber = typeof body?.seasonNumber === "number" ? body.seasonNumber : Number(body?.seasonNumber)
    if (!division) return NextResponse.json({ error: "Division is required." }, { status: 400 })
    if (!Number.isInteger(seasonNumber) || seasonNumber < 1) {
      return NextResponse.json({ error: "A valid season number is required." }, { status: 400 })
    }

    const { data, error } = await authorization.supabase.rpc("admin_approve_player_waitlist_entry", {
      p_waitlist_id: waitlistId,
      p_division: division,
      p_season_number: seasonNumber,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ result: data }, { headers: { "Cache-Control": "no-store" } })
  }

  if (action === "remove") {
    const { data, error } = await authorization.supabase.rpc("admin_remove_player_waitlist_entry", {
      p_waitlist_id: waitlistId,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ result: data }, { headers: { "Cache-Control": "no-store" } })
  }

  return NextResponse.json({ error: "Unsupported wait-list action." }, { status: 400 })
}
