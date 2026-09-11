import "server-only"

import { createClient } from "@supabase/supabase-js"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

function trustedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Missing trusted Supabase server configuration")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

type Body = {
  action?: "create_league_schedule" | "insert_schedule"
  league_type?: string
  division?: string
  season_number?: number
  due_date?: string
  matches?: Array<Record<string, unknown>>
  row?: Record<string, unknown>
}

function errorResponse(error: string, status = 400) { return Response.json({ error }, { status }) }

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  let body: Body
  try { body = await request.json() as Body } catch { return errorResponse("Invalid JSON body") }
  const client = trustedClient()

  if (body.action === "create_league_schedule") {
    if (!body.league_type || !body.division || !Number.isInteger(body.season_number) || !body.due_date || !Array.isArray(body.matches) || body.matches.length === 0) return errorResponse("league_type, division, season_number, due_date, and matches are required")
    const existing = await client.from("seasons").select("id").eq("league_type", body.league_type).eq("division", body.division).eq("season_number", body.season_number).maybeSingle()
    if (existing.error) return errorResponse(existing.error.message)
    if (existing.data) return errorResponse("This season already exists", 409)
    const season = await client.from("seasons").insert({ league_type: body.league_type, division: body.division, season_number: body.season_number, due_date: body.due_date }).select("id").maybeSingle()
    if (season.error) return errorResponse(season.error.message)
    const payload = body.matches.map((match) => ({ league_type: body.league_type, division: body.division, season_number: body.season_number, game: match.game, course: match.course, player1: match.player1, player2: match.player2 }))
    const schedule = await client.from("schedule").insert(payload)
    if (schedule.error) return errorResponse(schedule.error.message)
    return Response.json({ data: { season: season.data, schedule: schedule.data ?? null } }, { headers: { "Cache-Control": "no-store" } })
  }

  if (body.action === "insert_schedule") {
    if (!body.row || typeof body.row !== "object") return errorResponse("row is required")
    const result = await client.from("schedule").insert([body.row])
    if (result.error) return errorResponse(result.error.message)
    return Response.json({ data: result.data ?? null }, { headers: { "Cache-Control": "no-store" } })
  }
  return errorResponse("Unsupported schedule mutation")
}
