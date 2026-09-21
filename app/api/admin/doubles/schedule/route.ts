import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createAdminServiceClient } from "@/lib/admin/adminServiceClient"

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const body = await request.json() as {
    seasonNumber?: number
    division?: string
    matches?: Array<{ game?: string; course?: string; player1?: string; player2?: string }>
  }
  const matches = Array.isArray(body.matches) ? body.matches : []
  const rows = matches.map((match) => ({
    league_type: "doubles",
    division: String(body.division || ""),
    season_number: Number(body.seasonNumber),
    game: String(match.game || ""),
    course: String(match.course || ""),
    player1: String(match.player1 || ""),
    player2: String(match.player2 || ""),
  }))
  if (!rows.length) return NextResponse.json({ error: "No Doubles matches supplied." }, { status: 400 })
  const result = await createAdminServiceClient().from("schedule").insert(rows)
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ data: null })
}
