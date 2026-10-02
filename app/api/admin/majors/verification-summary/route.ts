import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const event = await authorization.supabase.from("major_events").select("id").eq("slug", "masters").maybeSingle()
  if (event.error || !event.data) return NextResponse.json({ rooms: 0, scores: 0, latestId: null }, { headers: { "Cache-Control": "no-store" } })
  const summary = await authorization.supabase.rpc("get_major_scorecard_verification_summary", { p_major_event_id: event.data.id })
  if (summary.error) return NextResponse.json({ error: summary.error.message }, { status: 503, headers: { "Cache-Control": "no-store" } })

  const value = (summary.data || {}) as { rooms?: number; scores?: number; latestId?: string | null }
  return NextResponse.json({ rooms: Number(value.rooms) || 0, scores: Number(value.scores) || 0, latestId: value.latestId || null }, { headers: { "Cache-Control": "no-store" } })
}
