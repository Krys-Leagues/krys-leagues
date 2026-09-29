import { NextResponse } from "next/server"

import {
  parseVerifiedScorecardJson,
  verifyScorecardBridgeRequest,
} from "@/lib/scorecards/bridge"
import { createScorecardServiceClient } from "@/lib/scorecards/server"

export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_BODY_BYTES = 1_000_000

type GameSnapshot = {
  schemaVersion?: unknown
  game?: { id?: unknown; revision?: unknown }
  participants?: unknown
  scorecards?: unknown
  confirmations?: unknown
  events?: unknown
}

function validSnapshot(snapshot: GameSnapshot) {
  const revision = Number(snapshot.game?.revision)
  return snapshot.schemaVersion === 1
    && UUID.test(String(snapshot.game?.id || ""))
    && Number.isSafeInteger(revision)
    && revision > 0
    && Array.isArray(snapshot.participants)
    && snapshot.participants.length <= 100
    && Array.isArray(snapshot.scorecards)
    && snapshot.scorecards.length <= 100
    && Array.isArray(snapshot.confirmations)
    && snapshot.confirmations.length <= 100
    && Array.isArray(snapshot.events)
    && snapshot.events.length <= 1_000
}

export async function POST(request: Request) {
  const verification = await verifyScorecardBridgeRequest(request)
  if (!verification.verified) return verification.response
  if (verification.body.byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Course Challenge history payload is too large." }, { status: 413 })
  }

  let snapshot: GameSnapshot
  try {
    snapshot = parseVerifiedScorecardJson<GameSnapshot>(verification.body)
  } catch {
    return NextResponse.json({ error: "Invalid Course Challenge history payload." }, { status: 400 })
  }
  if (!validSnapshot(snapshot)) {
    return NextResponse.json({ error: "Invalid Course Challenge history snapshot." }, { status: 400 })
  }

  try {
    const service = createScorecardServiceClient()
    const { data, error } = await service.rpc("sync_course_challenge_discord_game", {
      p_snapshot: snapshot,
    })
    if (error) throw error
    return NextResponse.json(data || { ok: true }, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return NextResponse.json(
      { error: "Course Challenge game history is temporarily unavailable." },
      { status: 503 },
    )
  }
}
