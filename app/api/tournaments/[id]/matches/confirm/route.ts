import { NextResponse } from "next/server"
import { getCourseChallengeIdentity } from "@/lib/courseChallenges/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const identity = await getCourseChallengeIdentity()
  if (!identity) return NextResponse.json({ error: "Sign in with a linked canonical player before confirming." }, { status: 401 })
  const { id } = await context.params
  const body = await request.json().catch(() => null) as { winnerPlayerId?: unknown } | null
  if (typeof body?.winnerPlayerId !== "string") return NextResponse.json({ error: "A winner is required." }, { status: 400 })
  const { data, error } = await (await createServerSupabaseClient()).rpc("confirm_tournament_winner", { p_match_id: id, p_selected_winner_id: body.winnerPlayerId })
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 })
  return NextResponse.json({ result: data })
}
