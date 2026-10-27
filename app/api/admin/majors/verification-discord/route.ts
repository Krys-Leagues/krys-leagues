import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { resolveMastersVerificationContext, syncMastersVerificationDiscordRoom } from "@/lib/mastersDiscordServer"
import { createScorecardServiceClient } from "@/lib/scorecards/server"

export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const body = await request.json().catch(() => null) as null | { scorecardIds?: unknown }
  const scorecardIds = Array.isArray(body?.scorecardIds)
    ? [...new Set(body.scorecardIds.filter((value): value is string => typeof value === "string" && UUID.test(value)))].slice(0, 100)
    : []
  if (scorecardIds.length === 0) return response({ synced: 0 })

  const contexts = await Promise.all(scorecardIds.map((id) => resolveMastersVerificationContext(authorization.supabase, id)))
  const uniqueContexts = [...new Map(contexts.map((context) => [
    `${context.major_event_id}:${context.play_day_id}:${context.schedule_group_id}`,
    context,
  ])).values()]
  const service = createScorecardServiceClient()
  const results = []
  for (const context of uniqueContexts) {
    try {
      results.push(await syncMastersVerificationDiscordRoom({ service, context }))
    } catch (caught) {
      results.push({ synced: false as const, reason: caught instanceof Error ? caught.message : "Discord synchronization failed." })
    }
  }
  return response({ synced: results.filter((result) => result.synced).length, rooms: results.length })
}
