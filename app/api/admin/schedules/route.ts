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

const ADMIN_SCHEDULE_COLUMNS = "id, season_id, league_type, division, season_number, division_number, game_number, game, course, player1, player2, player1_name, player2_name, player1_id, player2_id, status, due_date, roster_version_id, match_roster_version_id"

function errorResponse(error: string, status = 400) { return Response.json({ error }, { status }) }

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const params = new URL(request.url).searchParams
  const client = trustedClient()
  let query = client.from("schedule").select(ADMIN_SCHEDULE_COLUMNS)

  const leagueType = params.get("league_type")?.trim()
  const division = params.get("division")?.trim()
  const seasonId = params.get("season_id")?.trim()
  const seasonNumber = params.get("season_number")
  const game = params.get("game")?.trim()
  const matchRosterVersionId = params.get("match_roster_version_id")?.trim()
  const rosterVersionId = params.get("roster_version_id")?.trim()

  if (leagueType) query = query.eq("league_type", leagueType)
  if (division) query = query.eq("division", division)
  if (seasonId) query = query.eq("season_id", seasonId)
  if (seasonNumber) {
    const value = Number(seasonNumber)
    if (!Number.isInteger(value)) return errorResponse("season_number must be an integer")
    query = query.eq("season_number", value)
  }
  if (game) query = query.eq("game", game)
  if (matchRosterVersionId) query = query.eq("match_roster_version_id", matchRosterVersionId)
  if (rosterVersionId) query = query.eq("roster_version_id", rosterVersionId)
  if (params.get("require_real_players") === "true") {
    query = query
      .not("division_number", "is", null)
      .not("game_number", "is", null)
      .not("player1_id", "is", null)
      .not("player2_id", "is", null)
  }
  if (params.get("roster_version_id_not_null") === "true") query = query.not("roster_version_id", "is", null)

  const result = params.get("sort") === "game"
    ? await query.order("game", { ascending: true })
    : await query.order("division_number", { ascending: true }).order("game_number", { ascending: true }).order("id", { ascending: true })
  if (result.error) return errorResponse(result.error.message, 503)
  return Response.json({ schedule: result.data || [] }, { headers: { "Cache-Control": "no-store" } })
}

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
