import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { resolveMastersVerificationContext, syncMastersVerificationDiscordRoom } from "@/lib/mastersDiscordServer"
import { createScorecardServiceClient } from "@/lib/scorecards/server"

export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ACTIONS = new Set(["verify_major_scorecard", "reopen_major_scorecard"])
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const body = await request.json().catch(() => null) as null | Record<string, unknown>
  const action = typeof body?.action === "string" ? body.action : ""
  const scorecardId = typeof body?.scorecardId === "string" ? body.scorecardId : ""
  const notes = typeof body?.notes === "string" ? body.notes.trim() : ""
  if (!ACTIONS.has(action) || !UUID.test(scorecardId) || notes.length > 1000) {
    return response({ error: "A valid Masters verification action is required." }, 400)
  }
  if (action === "reopen_major_scorecard" && !notes) {
    return response({ error: "Correction notes are required." }, 400)
  }

  const result = await authorization.supabase.rpc(action, {
    p_scorecard_id: scorecardId,
    p_notes: notes || null,
  })
  if (result.error) return response({ error: result.error.message }, 403)

  try {
    const context = await resolveMastersVerificationContext(authorization.supabase, scorecardId)
    const sync = await syncMastersVerificationDiscordRoom({
      service: createScorecardServiceClient(),
      context,
    })
    return response({ updated: true, verificationAlert: sync.status || sync.reason })
  } catch (caught) {
    return response({
      updated: true,
      verificationAlert: "failed",
      warning: caught instanceof Error ? caught.message : "The score was updated, but the Discord work queue needs retrying.",
    })
  }
}
