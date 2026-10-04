import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const eventId = typeof body?.eventId === "string" ? body.eventId : ""
  const entryId = typeof body?.entryId === "string" ? body.entryId : ""
  const targetGroupId = typeof body?.targetGroupId === "string" ? body.targetGroupId : ""
  const reason = typeof body?.reason === "string" ? body.reason.trim() : ""
  if (![eventId, entryId, targetGroupId].every((value) => UUID.test(value)) || reason.length < 8 || reason.length > 1000) {
    return json({ error: "A valid event, player entry, target room, and reason are required." }, 400)
  }

  const result = await authorization.supabase.rpc("admin_assign_major_player_to_existing_final_room", {
    p_major_event_id: eventId,
    p_entry_id: entryId,
    p_target_group_id: targetGroupId,
    p_reason: reason,
  })
  if (result.error) return json({ error: result.error.message }, 409)
  return json({ assignment: result.data })
}
