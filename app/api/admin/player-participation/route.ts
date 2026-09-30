import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

type RequestBody = {
  action?: unknown
  playerId?: unknown
  leagueType?: unknown
  seasonNumber?: unknown
  division?: unknown
  tournamentType?: unknown
  bracket?: unknown
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const body = await request.json().catch(() => null) as RequestBody | null
  const action = typeof body?.action === "string" ? body.action : ""
  const playerId = typeof body?.playerId === "string" ? body.playerId.trim() : ""
  if (!UUID.test(playerId)) {
    return NextResponse.json({ error: "A valid canonical player UUID is required." }, { status: 400 })
  }

  if (action === "league") {
    const leagueType = typeof body?.leagueType === "string" ? body.leagueType.trim() : ""
    const division = typeof body?.division === "string" ? body.division.trim() : ""
    const seasonNumber = typeof body?.seasonNumber === "number" ? body.seasonNumber : Number(body?.seasonNumber)
    if (!leagueType || !division || !Number.isInteger(seasonNumber) || seasonNumber < 1) {
      return NextResponse.json({ error: "League, exact season number, and division are required." }, { status: 400 })
    }

    const { data, error } = await authorization.supabase.rpc("admin_add_player_league_membership", {
      p_player_id: playerId,
      p_league_type: leagueType,
      p_season_number: seasonNumber,
      p_division: division,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ registration: data }, { headers: { "Cache-Control": "no-store" } })
  }

  if (action === "tournament") {
    const tournamentType = typeof body?.tournamentType === "string" ? body.tournamentType.trim() : ""
    const bracket = typeof body?.bracket === "string" ? body.bracket.trim() : ""
    if (!tournamentType) {
      return NextResponse.json({ error: "Tournament type is required." }, { status: 400 })
    }

    const { data, error } = await authorization.supabase.rpc("admin_add_player_tournament_entry", {
      p_player_id: playerId,
      p_tournament_type: tournamentType,
      p_bracket: bracket || null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ registration: data }, { headers: { "Cache-Control": "no-store" } })
  }

  return NextResponse.json({ error: "Unsupported player participation action." }, { status: 400 })
}
