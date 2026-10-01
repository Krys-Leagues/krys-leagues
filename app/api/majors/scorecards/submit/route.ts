import { NextResponse } from "next/server"

import { resolveMastersVerificationContext, syncMastersVerificationDiscordRoom } from "@/lib/mastersDiscordServer"
import { createScorecardServiceClient } from "@/lib/scorecards/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const user = await supabase.auth.getUser()
  if (!user.data.user) return response({ error: "Sign in to submit your Masters scorecard." }, 401)

  const body = await request.json().catch(() => null) as null | { scorecardId?: unknown }
  const scorecardId = typeof body?.scorecardId === "string" ? body.scorecardId : ""
  if (!UUID.test(scorecardId)) return response({ error: "A valid Masters scorecard is required." }, 400)

  const submitted = await supabase.rpc("submit_my_major_scorecard", { p_scorecard_id: scorecardId })
  if (submitted.error) return response({ error: submitted.error.message }, 403)

  try {
    const context = await resolveMastersVerificationContext(supabase, scorecardId)
    const sync = await syncMastersVerificationDiscordRoom({
      service: createScorecardServiceClient(),
      context,
    })
    return response({ submitted: true, verificationAlert: sync.status || sync.reason })
  } catch (caught) {
    return response({
      submitted: true,
      verificationAlert: "failed",
      warning: caught instanceof Error ? caught.message : "The score was submitted, but the admin alert needs retrying.",
    })
  }
}
