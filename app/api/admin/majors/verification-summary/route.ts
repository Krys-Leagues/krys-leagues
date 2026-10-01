import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const event = await authorization.supabase.from("major_events").select("id").eq("slug", "masters").maybeSingle()
  if (event.error || !event.data) return NextResponse.json({ rooms: 0, scores: 0, latestId: null }, { headers: { "Cache-Control": "no-store" } })
  const queue = await authorization.supabase.rpc("get_major_scorecard_verification_queue", { p_major_event_id: event.data.id })
  if (queue.error) return NextResponse.json({ error: queue.error.message }, { status: 503, headers: { "Cache-Control": "no-store" } })

  const pending = ((queue.data || []) as Array<{ id: string; status: string; room_group_id: string | null; submitted_at: string | null }>)
    .filter((card) => card.status === "submitted")
  const roomKeys = new Set(pending.map((card) => card.room_group_id || `score:${card.id}`))
  const latest = pending.toSorted((left, right) => (right.submitted_at || "").localeCompare(left.submitted_at || ""))[0]
  return NextResponse.json({ rooms: roomKeys.size, scores: pending.length, latestId: latest?.id || null }, { headers: { "Cache-Control": "no-store" } })
}
