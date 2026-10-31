import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createDoublesRuntimeClient } from "@/lib/doublesParticipantServer"

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
    if (body.action === "publish_fixture" || body.action === "unpublish_fixture") {
      if (!body.fixture_id) return NextResponse.json({ error: "fixture_id is required" }, { status: 400 })
      const runtime = createDoublesRuntimeClient()
      const fixture = await runtime.from("doubles_managed_fixtures").select("id,season_id,home_season_team_id,away_season_team_id,status").eq("id", body.fixture_id).maybeSingle()
      if (fixture.error || !fixture.data) return NextResponse.json({ error: fixture.error?.message ?? "Fixture was not found" }, { status: 404 })
      if (fixture.data.status === "CANCELLED") return NextResponse.json({ error: "Cancelled fixtures cannot be published" }, { status: 409 })
      if (body.action === "publish_fixture") {
        const members = await runtime.from("doubles_season_team_members").select("season_team_id,player_id").eq("season_id", fixture.data.season_id).in("season_team_id", [fixture.data.home_season_team_id, fixture.data.away_season_team_id]).eq("role", "MEMBER").eq("active", true).is("effective_to", null)
        if (members.error || members.data?.length !== 4 || new Set(members.data.map((row) => row.player_id)).size !== 4) return NextResponse.json({ error: "Both teams must have two active season members before publication" }, { status: 409 })
      }
      const update = await runtime.from("doubles_managed_fixtures").update({ published_at: body.action === "publish_fixture" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", body.fixture_id).select("id,published_at,status").maybeSingle()
      if (update.error) return NextResponse.json({ error: update.error.message }, { status: 400 })
      if (!update.data) return NextResponse.json({ error: "Fixture was not found or is cancelled" }, { status: 404 })
      return NextResponse.json({ fixture: update.data })
    }
    if (body.action !== "upsert_fixture") return NextResponse.json({ error: "Unsupported Doubles schedule action" }, { status: 400 })
    const homeCourse = body.home_course || body.course
    const awayCourse = body.away_course || body.course
    if (!homeCourse || !awayCourse) return NextResponse.json({ error: "Both actual course names are required" }, { status: 400 })
    const { data, error } = await authorization.supabase.rpc("create_doubles_managed_fixture", { p_season_id: body.season_id, p_division: body.division, p_game_number: body.game_number, p_home_season_team_id: body.home_season_team_id, p_away_season_team_id: body.away_season_team_id, p_home_course: homeCourse, p_away_course: awayCourse, p_due_at: body.due_at ?? null })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ id: data })
  } catch {
    return NextResponse.json({ error: "Invalid Doubles schedule request" }, { status: 400 })
  }
}
