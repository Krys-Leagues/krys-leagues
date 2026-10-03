import { NextResponse } from "next/server"

import { parseVerifiedScorecardJson, verifyScorecardBridgeRequest } from "@/lib/scorecards/bridge"
import { createScorecardDeepLink } from "@/lib/scorecards/deepLink"
import { createScorecardServiceClient, loadDiscordScorecardState } from "@/lib/scorecards/server"

export const runtime = "nodejs"

type Body = { adapterKey?: unknown; sourceKey?: unknown; discordUserId?: unknown; componentKey?: unknown; courseName?: unknown }

export async function POST(request: Request) {
  const verification = await verifyScorecardBridgeRequest(request)
  if (!verification.verified) return verification.response
  let body: Body
  try { body = parseVerifiedScorecardJson<Body>(verification.body) } catch { return NextResponse.json({ status: "SUBMIT", reason: "invalid_request" }, { status: 400 }) }
  const adapterKey = body.adapterKey === "pyp" || body.adapterKey === "stroke" || body.adapterKey === "match" ? body.adapterKey : null
  const sourceKey = typeof body.sourceKey === "string" ? body.sourceKey.trim().slice(0, 200) : ""
  const discordUserId = typeof body.discordUserId === "string" ? body.discordUserId.trim() : ""
  const componentKey = typeof body.componentKey === "string" ? body.componentKey.trim() : "primary"
  const courseName = typeof body.courseName === "string" ? body.courseName.trim().slice(0, 200) : undefined
  if (!adapterKey || !sourceKey || !/^\d+$/.test(discordUserId) || (adapterKey === "pyp" ? !["course1", "course2"].includes(componentKey) : componentKey !== "primary")) return NextResponse.json({ status: "SUBMIT", reason: "invalid_request" }, { status: 400 })
  try {
    const state = await loadDiscordScorecardState({ client: createScorecardServiceClient(), adapterKey, sourceKey, discordUserId, componentKey, courseName })
    if (!state.authorized) return NextResponse.json({ status: "SUBMIT", reason: state.reason }, { status: state.reason === "identity_unavailable" || state.reason === "not_participant" ? 403 : 404 })
    const status = state.evidence?.review_status === "verified" ? "VERIFIED" : state.evidence ? "SUBMITTED" : "SUBMIT"
    return NextResponse.json({ status, adapterKey, sourceKey, componentKey: state.componentKey, evidenceId: state.evidence?.id || null, scorecardUrl: createScorecardDeepLink({ adapterKey, sourceKey, componentKey }) })
  } catch (error) {
    console.error("SCORECARD_DISCORD_STATUS_FAILED", error)
    return NextResponse.json({ status: "SUBMIT", reason: "fixture_unavailable" }, { status: 404 })
  }
}
