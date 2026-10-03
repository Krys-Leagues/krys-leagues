import { NextResponse } from "next/server"
import { createScorecardServiceClient, loadWebsiteScorecardContexts, resolveCanonicalSessionPlayer } from "@/lib/scorecards/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET() {
  const session = await createServerSupabaseClient()
  const userResult = await session.auth.getUser()
  if (userResult.error || !userResult.data.user) return NextResponse.json({ error: "Sign in with Discord to submit a scorecard." }, { status: 401, headers: { "Cache-Control": "no-store" } })
  const service = createScorecardServiceClient()
  const identity = await resolveCanonicalSessionPlayer(service, userResult.data.user)
  if (identity.status !== "resolved") return NextResponse.json({ error: identity.status === "ambiguous" ? "Your Discord identity matches more than one Global Player. Ask an admin to resolve it." : "Your Discord account is not linked to exactly one Global Player." }, { status: 403, headers: { "Cache-Control": "no-store" } })
  const contexts = await loadWebsiteScorecardContexts(service, identity.playerId)
  return NextResponse.json({ playerId: identity.playerId, contexts }, { headers: { "Cache-Control": "no-store" } })
}
