import { NextResponse } from "next/server"

import { loadPublicTournamentOverview } from "@/lib/tournaments/public"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const overview = await loadPublicTournamentOverview()
    return NextResponse.json({ tournaments: overview.open, available: overview.available }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Tournament data is unavailable.", code: "TOURNAMENT_DATA_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
