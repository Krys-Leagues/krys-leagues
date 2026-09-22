import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createAdminServiceClient } from "@/lib/admin/adminServiceClient"

const LEAGUES = new Set(["stroke", "match", "pyp", "doubles", "pro"])

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const body = await request.json() as { leagueType?: string; division?: string; seasonNumber?: number; game?: string; course?: string; player1?: string; player2?: string }
  const leagueType = String(body.leagueType || "")
  if (!LEAGUES.has(leagueType)) return NextResponse.json({ error: "Unsupported league type" }, { status: 400 })
  const result = await createAdminServiceClient().from("schedule").insert({
    league_type: leagueType,
    division: String(body.division || ""),
    season_number: Number(body.seasonNumber),
    game: String(body.game || ""),
    course: String(body.course || ""),
    player1: String(body.player1 || ""),
    player2: String(body.player2 || ""),
  })
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ data: null })
}
