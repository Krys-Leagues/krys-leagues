import "server-only"

import { createClient } from "@supabase/supabase-js"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Player tracker server access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

const editableFields = new Set(["status", "cup_tier", "best_bracket_round", "bracket_wins", "notes"])

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const supabase = adminClient()
    const players = await supabase.from("player_tracker").select("*").order("screen_name", { ascending: true })
    if (players.error) return json({ error: players.error.message }, 503)
    const includeWaitlist = new URL(request.url).searchParams.get("includeWaitlist") === "true"
    if (!includeWaitlist) return json({ data: players.data || [] })
    const waitlist = await supabase.from("player_waitlist").select("screen_name, discord_username, discord_id")
    if (waitlist.error) return json({ error: waitlist.error.message }, 503)
    return json({ data: players.data || [], waitlist: waitlist.data || [] })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Player tracker could not be loaded." }, 503)
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const body = await request.json() as { players?: Record<string, unknown>[]; player?: Record<string, unknown> }
    const rows = body.players || (body.player ? [body.player] : [])
    if (rows.length === 0) return json({ error: "At least one player is required." }, 400)
    const result = await adminClient().from("player_tracker").insert(rows).select("*")
    if (result.error) return json({ error: result.error.message }, 503)
    return json({ data: result.data || [] })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Player tracker entry could not be created." }, 503)
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const body = await request.json() as { id?: string; field?: string; value?: string | number | null; updates?: Record<string, string | number | null> }
    if (!body.id) return json({ error: "A player is required." }, 400)
    const updates = body.updates || (body.field && editableFields.has(body.field) ? { [body.field]: body.value } : null)
    if (!updates || Object.keys(updates).length === 0 || Object.keys(updates).some((field) => !editableFields.has(field))) {
      return json({ error: "At least one valid editable field is required." }, 400)
    }
    const result = await adminClient().from("player_tracker").update(updates).eq("id", body.id).select("*").single()
    if (result.error) return json({ error: result.error.message }, 503)
    return json({ data: result.data })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Player tracker entry could not be updated." }, 503)
  }
}
