import { NextResponse } from "next/server"

import { createServerSupabaseClient } from "@/lib/supabase/server"
import { isMissingTournamentSchema } from "@/lib/tournaments/server"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const body = await request.json().catch(() => null) as { timezone?: unknown } | null
  const timezone = typeof body?.timezone === "string" ? body.timezone.trim() : ""
  if (!timezone) return NextResponse.json({ error: "Confirm your IANA time zone before registering." }, { status: 400 })
  const supabase = await createServerSupabaseClient()
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) return NextResponse.json({ error: "Discord sign-in is required before registering." }, { status: 401 })
  const { data, error } = await supabase.rpc("register_for_tournament", { p_tournament_id: id, p_player_timezone: timezone })
  if (error) return NextResponse.json({ error: isMissingTournamentSchema(error) ? "Tournament Builder schema is not installed in this environment." : error.message }, { status: isMissingTournamentSchema(error) ? 503 : 400 })
  return NextResponse.json({ registration: data }, { status: 201 })
}
