import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createAdminServiceClient } from "@/lib/admin/adminServiceClient"

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const body = await request.json() as {
    seasonNumber?: number
    division?: string
    dueDate?: string
    matches?: Array<{ game?: string; course?: string; player1?: string; player2?: string }>
  }
  const matches = Array.isArray(body.matches) ? body.matches : []
  const rows = matches.map((match) => ({
    league_type: "pro",
    division: String(body.division || ""),
    season_number: Number(body.seasonNumber),
    game: String(match.game || ""),
    course: String(match.course || ""),
    player1: String(match.player1 || ""),
    player2: String(match.player2 || ""),
  }))
  if (!rows.length) return NextResponse.json({ error: "No Pro matches supplied." }, { status: 400 })
  const client = createAdminServiceClient()
  const existing = await client.from("seasons").select("id").eq("league_type", "pro").eq("division", String(body.division || "")).eq("season_number", Number(body.seasonNumber)).maybeSingle()
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 400 })
  if (existing.data) return NextResponse.json({ error: "This season already exists" }, { status: 400 })
  const season = await client.from("seasons").insert({ league_type: "pro", division: String(body.division || ""), season_number: Number(body.seasonNumber), due_date: String(body.dueDate || "") })
  if (season.error) return NextResponse.json({ error: season.error.message }, { status: 400 })
  const schedule = await client.from("schedule").insert(rows)
  if (schedule.error) return NextResponse.json({ error: schedule.error.message }, { status: 400 })
  return NextResponse.json({ data: null })
}
