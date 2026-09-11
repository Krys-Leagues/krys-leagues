import "server-only"

import { createClient } from "@supabase/supabase-js"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Missing trusted Supabase server configuration")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const client = adminClient()
  const [players, records] = await Promise.all([
    client.from("players").select("id,screen_name").eq("active", true).order("screen_name", { ascending: true }),
    client.from("combined_course_records").select("*").order("course_name", { ascending: true }).order("combined_score", { ascending: true }),
  ])
  const error = players.error || records.error
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ players: players.data ?? [], records: records.data ?? [] }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  let body: { player_id?: unknown; player_name?: unknown; course_name?: unknown; easy_score?: unknown; hard_score?: unknown; combined_score?: unknown; played_at?: unknown; notes?: unknown }
  try { body = await request.json() as typeof body } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }
  const playerId = typeof body.player_id === "string" ? body.player_id : ""
  const playerName = typeof body.player_name === "string" ? body.player_name : ""
  const courseName = typeof body.course_name === "string" ? body.course_name : ""
  const easyScore = body.easy_score
  const hardScore = body.hard_score
  const combinedScore = body.combined_score
  if (!playerId || !playerName || !courseName || typeof easyScore !== "number" || !Number.isFinite(easyScore) || typeof hardScore !== "number" || !Number.isFinite(hardScore) || typeof combinedScore !== "number" || !Number.isFinite(combinedScore) || combinedScore !== easyScore + hardScore) {
    return Response.json({ error: "Invalid combined record" }, { status: 400 })
  }
  const result = await adminClient().from("combined_course_records").upsert([{
    player_id: playerId,
    player_name: playerName,
    course_name: courseName,
    easy_score: easyScore,
    hard_score: hardScore,
    combined_score: combinedScore,
    played_at: typeof body.played_at === "string" && body.played_at ? body.played_at : null,
    notes: typeof body.notes === "string" && body.notes ? body.notes : null,
  }], { onConflict: "player_name,course_name" })
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 })
  return Response.json({ data: result.data ?? null })
}
