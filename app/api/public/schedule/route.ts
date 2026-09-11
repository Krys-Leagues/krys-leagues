import "server-only"

import { NextResponse } from "next/server"
import { createTrustedSupabaseClient } from "@/lib/supabase/trustedServer"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PUBLIC_SCHEDULE_COLUMNS = "id, league_type, division, season_number, game, course, player1_id, player2_id"

export async function GET() {
  const result = await createTrustedSupabaseClient()
    .from("schedule")
    .select(PUBLIC_SCHEDULE_COLUMNS)
    .order("game", { ascending: true })

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 503 })
  return NextResponse.json(
    { schedule: result.data || [] },
    { headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=30" } },
  )
}
