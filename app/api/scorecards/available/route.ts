import { NextResponse } from "next/server"
import { parseScorecardDeepLinkToken } from "@/lib/scorecards/deepLink"
import { createScorecardServiceClient, loadWebsiteScorecardContexts, resolveCanonicalSessionPlayer } from "@/lib/scorecards/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const session = await createServerSupabaseClient()
  const userResult = await session.auth.getUser()
  if (userResult.error || !userResult.data.user) return NextResponse.json({ error: "Sign in with Discord to submit a scorecard." }, { status: 401, headers: { "Cache-Control": "no-store" } })
  const service = createScorecardServiceClient()
  const identity = await resolveCanonicalSessionPlayer(service, userResult.data.user)
  if (identity.status !== "resolved") return NextResponse.json({ error: identity.status === "ambiguous" ? "Your Discord identity matches more than one Global Player. Ask an admin to resolve it." : "Your Discord account is not linked to exactly one Global Player." }, { status: 403, headers: { "Cache-Control": "no-store" } })
  const contexts = await loadWebsiteScorecardContexts(service, identity.playerId)
  const requested = parseScorecardDeepLinkToken(new URL(request.url).searchParams.get("fixture"))
  if (!requested) return NextResponse.json({ playerId: identity.playerId, contexts }, { headers: { "Cache-Control": "no-store" } })
  const matchIndex = contexts.findIndex((context) => context.adapterKey === requested.adapterKey && context.sourceKey === requested.sourceKey && context.evidence.some((slot) => slot.componentKey === requested.componentKey))
  if (matchIndex > 0) {
    const [selected] = contexts.splice(matchIndex, 1)
    contexts.unshift(selected)
  }
  return NextResponse.json({ playerId: identity.playerId, contexts, requestedContext: matchIndex >= 0 ? `${requested.adapterKey}:${requested.sourceKey}:${requested.componentKey}` : null }, { headers: { "Cache-Control": "no-store" } })
}
