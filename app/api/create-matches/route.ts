import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

export async function POST(req: Request) {
  try {
    const { matches } = await req.json()

    if (!matches || !Array.isArray(matches)) {
      return NextResponse.json(
        { error: "Invalid matches payload" },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from("matches")
      .insert(
        matches.map((m: any) => ({
          league_type: m.league_type,
          division: m.division,
          player1_id: m.player1_id,
          player2_id: m.player2_id,
          player1_score: m.player1_score ?? null,
          player2_score: m.player2_score ?? null,
          player1_points: m.player1_points ?? null,
          player2_points: m.player2_points ?? null,
          player1_total_holes: m.player1_total_holes ?? null,
          player2_total_holes: m.player2_total_holes ?? null,
        }))
      )

    if (error) {
      console.error(error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    )
  }
}