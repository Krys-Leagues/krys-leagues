import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const body = (await request.json()) as {
      season_id?: unknown
      division_number?: unknown
      game_number?: unknown
    }

    const seasonId = typeof body.season_id === "string" ? body.season_id.trim() : ""
    const divisionNumber = Number(body.division_number)
    const gameNumber = Number(body.game_number)

    if (!seasonId || !Number.isInteger(divisionNumber) || !Number.isInteger(gameNumber)) {
      return NextResponse.json({ error: "Season, division, and game are required." }, { status: 400 })
    }

    const { data, error } = await authorization.supabase
      .rpc("spin_match_course_wheel", {
        p_season_id: seasonId,
        p_division_number: divisionNumber,
        p_game_number: gameNumber,
      })
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "The Match course wheel did not return a selection." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      )
    }

    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The Match course wheel request failed." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    )
  }
}
