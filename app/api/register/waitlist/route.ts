import "server-only"

import { createClient } from "@supabase/supabase-js"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getAuthenticatedDiscordId } from "@/lib/discordPlayerLogin"
import { isDuplicateWaitlistError, waitlistDuplicateMessage } from "@/lib/waitlistMessages"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Waitlist server access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function POST(request: Request) {
  try {
    const authClient = await createServerSupabaseClient()
    const userResult = await authClient.auth.getUser()
    if (userResult.error || !userResult.data.user) return json({ error: "Discord sign-in is required." }, 401)
    const discordId = getAuthenticatedDiscordId(userResult.data.user)
    if (!discordId) return json({ error: "Discord identity could not be verified." }, 403)

    const body = await request.json() as { screenName?: string; leagueType?: string; notes?: string | null }
    const screenName = body.screenName?.trim()
    const leagueType = body.leagueType?.trim()
    if (!screenName || !leagueType) return json({ error: "League and screen name are required." }, 400)

    const discordName = userResult.data.user.user_metadata?.full_name
      || userResult.data.user.user_metadata?.name
      || userResult.data.user.user_metadata?.preferred_username
      || userResult.data.user.user_metadata?.user_name
      || "Discord User"
    const supabase = serviceClient()
    const existing = await supabase.from("player_waitlist").select("id")
      .eq("discord_id", discordId).eq("league_type", leagueType).in("status", ["waiting", "pending"]).limit(1)
    if (existing.error) return json({ error: existing.error.message }, 503)
    if (existing.data?.length) return json({ error: waitlistDuplicateMessage(leagueType) }, 409)

    const result = await supabase.from("player_waitlist").insert({
      screen_name: screenName,
      league_type: leagueType,
      discord_id: discordId,
      discord_username: String(discordName),
      notes: body.notes?.trim() || null,
      status: "waiting",
    })
    if (result.error) {
      if (isDuplicateWaitlistError(result.error)) return json({ error: waitlistDuplicateMessage(leagueType) }, 409)
      return json({ error: result.error.message }, 503)
    }
    return json({ data: { ok: true } })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Waitlist registration could not be saved." }, 503)
  }
}
