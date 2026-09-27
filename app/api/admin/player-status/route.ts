import { NextRequest, NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

const PLAYER_STATUSES = new Set(["active", "inactive", "archived", "memorial"])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  let body: { playerId?: unknown; status?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const playerId = typeof body.playerId === "string" ? body.playerId : ""
  const status = typeof body.status === "string" ? body.status.trim().toLowerCase() : ""

  if (!UUID_PATTERN.test(playerId) || !PLAYER_STATUSES.has(status)) {
    return NextResponse.json({ error: "invalid_player_status_request" }, { status: 400 })
  }

  const { data, error } = await authorization.supabase.rpc("admin_update_player_status", {
    p_player_id: playerId,
    p_status: status,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ player: Array.isArray(data) ? data[0] ?? null : data }, {
    headers: { "Cache-Control": "no-store" },
  })
}
