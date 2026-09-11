import "server-only"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createTrustedSupabaseClient } from "@/lib/supabase/trustedServer"

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  let body: Record<string, unknown>
  try {
    body = await request.json() as Record<string, unknown>
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { error } = await createTrustedSupabaseClient().from("activity_log").insert({
    user_type: body.userType,
    action: body.action,
    status: body.status ?? "success",
    page: body.page ?? null,
    league_type: body.leagueType ?? null,
    division: body.division ?? null,
    discord_id: body.discordId ?? null,
    discord_name: body.discordName ?? null,
    user_id: body.userId ?? authorization.user.id,
    details: body.details ?? {},
    created_by: authorization.user.id,
  })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } })
}
