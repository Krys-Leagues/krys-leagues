import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createScorecardServiceClient } from "@/lib/scorecards/server"
import { enqueueStrokeBoardSync, loadAuthoritativeStrokeBoards } from "@/lib/scorecards/strokeBoardServer"

export const runtime = "nodejs"

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    const boards = await loadAuthoritativeStrokeBoards(createScorecardServiceClient())
    return NextResponse.json({ boards }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "The current Stroke workspace is unavailable." }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  let body: { seasonId?: unknown; division?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid retry request." }, { status: 400 }) }
  const boards = await loadAuthoritativeStrokeBoards(createScorecardServiceClient())
  const board = boards.find((candidate) => candidate.seasonId === String(body.seasonId || "") && candidate.division === Number(body.division))
  if (!board) return NextResponse.json({ error: "That current Stroke division is unavailable." }, { status: 409 })
  try {
    await enqueueStrokeBoardSync(createScorecardServiceClient(), board.seasonId, board.division, "admin_retry")
    return NextResponse.json({ queued: true })
  } catch {
    return NextResponse.json({ error: "The board retry could not be queued." }, { status: 503 })
  }
}
