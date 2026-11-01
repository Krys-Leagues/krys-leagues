import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

type ResultRow = {
  player1: string
  player2: string
  player1_id: string | null
  player2_id: string | null
  player1_score: number | null
  player2_score: number | null
  winner: string | null
  is_draw: boolean | null
}

type Standing = {
  player: string
  player_id: string | null
  played: number
  wins: number
  draws: number
  losses: number
  points: number
  strokes: number
  rank: number
}

function ensurePlayer(map: Map<string, Standing>, player: string, playerId: string | null) {
  const key = playerId || player

  if (!map.has(key)) {
    map.set(key, {
      player,
      player_id: playerId,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      strokes: 0,
      rank: 0,
    })
  }
}

export async function POST(req: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const body = await req.json()

    const leagueType = body.league_type
    const division = body.division
    const seasonNumber = Number(body.season_number)

    if (
      typeof leagueType === "string" &&
      leagueType.trim().toLowerCase() === "stroke"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Managed Stroke standings must be rebuilt through rebuild_stroke_standings.",
        },
        { status: 400 }
      )
    }

    if (!leagueType || !division || !seasonNumber) {
      return NextResponse.json(
        { success: false, error: "Missing league_type, division, or season_number" },
        { status: 400 }
      )
    }

    const { data, error } = await authorization.supabase
      .from("results")
      .select("player1, player2, player1_id, player2_id, player1_score, player2_score, winner, is_draw")
      .eq("league_type", leagueType)
      .eq("division", division)
      .eq("season_number", seasonNumber)

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    const table = new Map<string, Standing>()

    ;((data || []) as ResultRow[]).forEach((row) => {
      if (row.player1_score === null || row.player2_score === null) return

      ensurePlayer(table, row.player1, row.player1_id)
      ensurePlayer(table, row.player2, row.player2_id)

      const p1 = table.get(row.player1_id || row.player1)!
      const p2 = table.get(row.player2_id || row.player2)!

      p1.played += 1
      p2.played += 1

      p1.strokes += Number(row.player1_score)
      p2.strokes += Number(row.player2_score)

      if (row.is_draw || row.player1_score === row.player2_score) {
        p1.draws += 1
        p2.draws += 1
        p1.points += 1
        p2.points += 1
        return
      }

      if (row.winner === row.player1 || row.player1_score < row.player2_score) {
        p1.wins += 1
        p2.losses += 1
        p1.points += 3
        return
      }

      if (row.winner === row.player2 || row.player2_score < row.player1_score) {
        p2.wins += 1
        p1.losses += 1
        p2.points += 3
      }
    })

    const sorted = Array.from(table.values()).sort((a, b) => {
      return (
        b.points - a.points ||
        b.wins - a.wins ||
        a.strokes - b.strokes ||
        a.player.localeCompare(b.player)
      )
    })

    const standings = sorted.map((row, index) => ({
      ...row,
      rank: index + 1,
    }))

    const missingIds = standings.filter((row) => !row.player_id)

    if (missingIds.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Some standings are missing player IDs",
          missingPlayers: missingIds.map((row) => row.player),
        },
        { status: 400 }
      )
    }

    const rows = standings.map((row) => ({
      player_id: row.player_id,
      league_type: leagueType,
      season_number: seasonNumber,
      division,
      points: row.points,
      wins: row.wins,
      losses: row.losses,
      ties: row.draws,
      strokes: row.strokes,
      rank: row.rank,
      updated_at: new Date().toISOString(),
    }))

    if (rows.length === 0) {
      return NextResponse.json({ success: true, saved: 0 })
    }

    const { error: saveError } = await authorization.supabase
      .from("season_standings")
      .upsert(rows, {
        onConflict: "player_id,league_type,season_number,division",
      })

    if (saveError) {
      return NextResponse.json(
        { success: false, error: saveError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      saved: rows.length,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Recalculate standings failed" },
      { status: 500 }
    )
  }
}
