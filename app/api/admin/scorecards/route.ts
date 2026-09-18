import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { loadScorecardReviewContext, saveAdminScorecardReview, type AdminScorecardInput } from "@/lib/scorecards/adminServer"
import { createScorecardServiceClient } from "@/lib/scorecards/server"

export const runtime = "nodejs"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } })

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const evidenceId = new URL(request.url).searchParams.get("id") || ""
  const service = createScorecardServiceClient()
  try {
    if (UUID.test(evidenceId)) return json(await loadScorecardReviewContext(service, evidenceId))
    const queue = await service.from("shared_scorecard_evidence")
      .select("id,review_status,submitted_at,original_filename,shared_scorecard_contexts(adapter_key,season_number,division_label,game_number,course_name_snapshot,difficulty)")
      .in("review_status", ["submitted", "under_review"])
      .order("submitted_at", { ascending: true }).limit(100)
    if (queue.error) throw queue.error
    return json({ queue: queue.data || [] })
  } catch {
    return json({ error: "The scorecard review queue is unavailable." }, 503)
  }
}

type SaveBody = {
  evidenceId?: unknown
  playedDate?: unknown
  rawCardDateText?: unknown
  changeReason?: unknown
  cards?: unknown
  action?: unknown
}

export async function PATCH(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  let body: SaveBody
  try { body = await request.json() as SaveBody } catch { return json({ error: "Invalid review request." }, 400) }
  if (!UUID.test(String(body.evidenceId || "")) || !Array.isArray(body.cards) || !["draft", "verify"].includes(String(body.action))) {
    return json({ error: "Invalid review request." }, 400)
  }
  try {
    const result = await saveAdminScorecardReview({
      client: createScorecardServiceClient(),
      evidenceId: String(body.evidenceId),
      adminAuthUserId: authorization.user.id,
      playedDate: String(body.playedDate || ""),
      rawCardDateText: typeof body.rawCardDateText === "string" ? body.rawCardDateText : null,
      changeReason: typeof body.changeReason === "string" ? body.changeReason : null,
      cards: body.cards as AdminScorecardInput[],
      verify: body.action === "verify",
    })
    return json(result)
  } catch {
    return json({ error: body.action === "verify" ? "Verification did not complete; the review remains safe to retry." : "The draft could not be saved." }, 409)
  }
}
