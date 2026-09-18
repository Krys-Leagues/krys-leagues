import { NextResponse } from "next/server"

import { verifyScorecardBridgeRequest } from "@/lib/scorecards/bridge"
import { SCORECARD_ADAPTER_KEYS, type ScorecardAdapterKey } from "@/lib/scorecards/core"
import { createScorecardServiceClient, storeDiscordScorecardEvidence } from "@/lib/scorecards/server"
import { enqueueStrokeBoardSync } from "@/lib/scorecards/strokeBoardServer"

export const runtime = "nodejs"

function header(request: Request, name: string, length: number) {
  return (request.headers.get(name) || "").trim().slice(0, length)
}

export async function POST(request: Request) {
  const verification = await verifyScorecardBridgeRequest(request)
  if (!verification.verified) return verification.response
  const requestedAdapter = header(request, "x-krys-scorecard-adapter", 40)
  const adapterKey = SCORECARD_ADAPTER_KEYS.includes(requestedAdapter as ScorecardAdapterKey)
    ? requestedAdapter as ScorecardAdapterKey
    : null
  const sourceKey = header(request, "x-krys-scorecard-source", 200)
  const discordUserId = header(request, "x-krys-discord-user-id", 30)
  const filename = header(request, "x-krys-file-name", 255)
  const contentType = header(request, "content-type", 80).toLowerCase()
  if (!adapterKey || !sourceKey || !/^\d+$/.test(discordUserId) || !filename) {
    return NextResponse.json({ stored: false, reason: "invalid_request" }, { status: 400 })
  }
  try {
    const result = await storeDiscordScorecardEvidence({
      client: createScorecardServiceClient(), adapterKey, sourceKey, discordUserId,
      filename, contentType, bytes: verification.body,
    })
    if (!result.stored) {
      const status = result.reason === "already_submitted" ? 409 : result.reason === "invalid_image" ? 400 : 403
      return NextResponse.json(result, { status })
    }
    let boardSync: "queued" | "retry_required" = "queued"
    if (result.adapterKey === "stroke" && result.seasonId && result.divisionNumber) {
      try {
        await enqueueStrokeBoardSync(createScorecardServiceClient(), result.seasonId, result.divisionNumber, "scorecard_received")
      } catch {
        boardSync = "retry_required"
      }
    }
    return NextResponse.json({ ...result, boardSync }, { status: 201 })
  } catch (error) {
    const reason = error instanceof Error && error.message === "SCORECARD_ADAPTER_INTAKE_NOT_ENABLED"
      ? "adapter_not_enabled"
      : "storage_unavailable"
    return NextResponse.json({ stored: false, reason }, { status: 503 })
  }
}
