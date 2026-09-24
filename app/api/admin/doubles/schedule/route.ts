import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const params = new URL(request.url).searchParams
  const { data, error } = await authorization.supabase.rpc("list_doubles_admin_fixtures", { p_season_id: params.get("season_id"), p_division: params.get("division") })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ fixtures: data ?? [] })
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    const body = await request.json()
    if (body.action !== "upsert_fixture") return NextResponse.json({ error: "Unsupported Doubles schedule action" }, { status: 400 })
    const { data, error } = await authorization.supabase.rpc("create_doubles_managed_fixture", { p_season_id: body.season_id, p_division: body.division, p_game_number: body.game_number, p_home_season_team_id: body.home_season_team_id, p_away_season_team_id: body.away_season_team_id, p_course: body.course, p_due_at: body.due_at ?? null })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ id: data })
  } catch {
    return NextResponse.json({ error: "Invalid Doubles schedule request" }, { status: 400 })
  }
}
