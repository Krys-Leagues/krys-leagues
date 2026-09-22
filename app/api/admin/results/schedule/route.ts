import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createAdminServiceClient } from "@/lib/admin/adminServiceClient"

const LEAGUES = new Set(["stroke", "match", "pyp", "doubles", "pro"])

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const body = await request.json() as { leagueType?: string; division?: string; seasonNumber?: number; game?: string }
  const leagueType = String(body.leagueType || "")
  if (!LEAGUES.has(leagueType)) return NextResponse.json({ error: "Unsupported league type" }, { status: 400 })
  const result = await createAdminServiceClient()
    .from("schedule")
    .select("game, course, player1, player2, player1_id, player2_id")
    .eq("league_type", leagueType)
    .eq("division", String(body.division || ""))
    .eq("season_number", Number(body.seasonNumber))
    .eq("game", String(body.game || ""))
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ data: result.data || [] }, { headers: { "Cache-Control": "no-store" } })
}
