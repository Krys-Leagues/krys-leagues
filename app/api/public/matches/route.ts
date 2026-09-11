import "server-only"

import { NextResponse } from "next/server"
import { createTrustedSupabaseClient } from "@/lib/supabase/trustedServer"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PUBLIC_MATCH_COLUMNS = "id, league_type, division, season_number, game, course, player1_id, player2_id, player1_score, player2_score, is_draw"

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const division = params.get("division")?.trim()
  const seasonNumber = Number(params.get("season"))
  if (!division || !Number.isInteger(seasonNumber) || seasonNumber <= 0) {
    return NextResponse.json({ error: "division and a positive season are required." }, { status: 400 })
  }

  const client = createTrustedSupabaseClient()
  const [schedule, results] = await Promise.all([
    client.from("schedule").select("id, league_type, division, season_number, game, course, player1_id, player2_id").eq("division", division).eq("season_number", seasonNumber).order("game", { ascending: true }),
    client.from("results").select(PUBLIC_MATCH_COLUMNS).eq("division", division).eq("season_number", seasonNumber),
  ])
  const error = schedule.error || results.error
  if (error) return NextResponse.json({ error: error.message }, { status: 503 })
  return NextResponse.json({ schedule: schedule.data || [], results: results.data || [] }, { headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=30" } })
}
