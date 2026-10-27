import { NextResponse } from "next/server"
import { getCourseChallengeIdentity } from "@/lib/courseChallenges/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const identity = await getCourseChallengeIdentity()
  if (!identity) return NextResponse.json({ error: "Sign in with a linked canonical player before requesting a forfeit." }, { status: 401 })
  const { id } = await context.params
  const body = await request.json().catch(() => null) as { explanation?: unknown } | null
  if (typeof body?.explanation !== "string" || !body.explanation.trim()) return NextResponse.json({ error: "A written explanation is required." }, { status: 400 })
  const { data, error } = await (await createServerSupabaseClient()).rpc("request_tournament_forfeit", { p_match_id: id, p_explanation: body.explanation.trim() })
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 })
  return NextResponse.json({ requestId: data }, { status: 201 })
}
