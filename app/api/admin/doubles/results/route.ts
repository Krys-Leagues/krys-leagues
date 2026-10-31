import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const fixtureId = new URL(request.url).searchParams.get("fixture_id")
  const { data, error } = await authorization.supabase.rpc("list_doubles_admin_results", { p_fixture_id: fixtureId })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ results: data ?? [] })
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    const body = await request.json()
    if (body.action !== "save_result") return NextResponse.json({ error: "Unsupported Doubles result action" }, { status: 400 })
    const homeScore = Number(body.home_score)
    const awayScore = Number(body.away_score)
    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) return NextResponse.json({ error: "Team scores must be non-negative integers" }, { status: 400 })
    const saved = await authorization.supabase.rpc("save_doubles_managed_result", { p_fixture_id: body.fixture_id, p_home_score: homeScore, p_away_score: awayScore })
    if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 400 })
    const fixture = await authorization.supabase.from("doubles_managed_fixtures").select("season_id,division").eq("id", body.fixture_id).maybeSingle()
    if (fixture.error || !fixture.data) return NextResponse.json({ error: fixture.error?.message ?? "Fixture not found" }, { status: 400 })
    const rebuilt = await authorization.supabase.rpc("rebuild_doubles_managed_standings", { p_season_id: fixture.data.season_id, p_division: fixture.data.division })
    if (rebuilt.error) return NextResponse.json({ error: rebuilt.error.message }, { status: 500 })
    return NextResponse.json({ id: saved.data, standings_saved: rebuilt.data })
  } catch {
    return NextResponse.json({ error: "Invalid Doubles result request" }, { status: 400 })
  }
}
