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
  if (!url || !key) throw new Error("Doubles admin server access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const division = new URL(request.url).searchParams.get("division")?.trim()
  if (!division) return json({ error: "division is required." }, 400)

  try {
    let query = adminClient().from("doubles_teams").select("*").eq("division", division).order("team_name")
    if (new URL(request.url).searchParams.get("active") === "true") query = query.eq("active", true)
    const result = await query
    if (result.error) return json({ error: result.error.message }, 503)
    return json({ data: result.data || [] })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Doubles teams could not be loaded." }, 503)
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const body = await request.json() as { teamName?: string; player1?: string; player2?: string; division?: string }
    const teamName = body.teamName?.trim()
    const player1 = body.player1?.trim()
    const player2 = body.player2?.trim()
    const division = body.division?.trim()
    if (!teamName || !player1 || !player2 || !division) return json({ error: "All team fields are required." }, 400)
    if (player1 === player2) return json({ error: "Players must be different." }, 400)

    const result = await adminClient().from("doubles_teams").insert({
      team_name: teamName,
      player1,
      player2,
      division,
      active: true,
    }).select("*").single()
    if (result.error) return json({ error: result.error.message }, 503)
    return json({ data: result.data })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Doubles team could not be created." }, 503)
  }
}
