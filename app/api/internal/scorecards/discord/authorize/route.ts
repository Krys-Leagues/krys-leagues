import { NextResponse } from "next/server"

import { parseVerifiedScorecardJson, verifyScorecardBridgeRequest } from "@/lib/scorecards/bridge"
import { SCORECARD_ADAPTER_KEYS, type ScorecardAdapterKey } from "@/lib/scorecards/core"
import { authorizeDiscordScorecard, createScorecardServiceClient } from "@/lib/scorecards/server"

export const runtime = "nodejs"

type Body = { adapterKey?: unknown; sourceKey?: unknown; discordUserId?: unknown }

export async function POST(request: Request) {
  const verification = await verifyScorecardBridgeRequest(request)
  if (!verification.verified) return verification.response
  let body: Body
  try { body = parseVerifiedScorecardJson<Body>(verification.body) } catch {
    return NextResponse.json({ allowed: false, reason: "invalid_request" }, { status: 400 })
  }
  const adapterKey = typeof body.adapterKey === "string" && SCORECARD_ADAPTER_KEYS.includes(body.adapterKey as ScorecardAdapterKey)
    ? body.adapterKey as ScorecardAdapterKey
    : null
  const sourceKey = typeof body.sourceKey === "string" ? body.sourceKey.trim().slice(0, 200) : ""
  const discordUserId = typeof body.discordUserId === "string" ? body.discordUserId.trim() : ""
  if (!adapterKey || !sourceKey || !/^\d+$/.test(discordUserId)) {
    return NextResponse.json({ allowed: false, reason: "invalid_request" }, { status: 400 })
  }
  try {
    const result = await authorizeDiscordScorecard({
      client: createScorecardServiceClient(), adapterKey, sourceKey, discordUserId,
    })
    return NextResponse.json(result.authorized ? { allowed: true } : { allowed: false, reason: result.reason })
  } catch (error) {
    const reason = error instanceof Error && error.message === "SCORECARD_ADAPTER_INTAKE_NOT_ENABLED"
      ? "adapter_not_enabled"
      : "fixture_unavailable"
    return NextResponse.json({ allowed: false, reason }, { status: reason === "adapter_not_enabled" ? 409 : 404 })
  }
}
