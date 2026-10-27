import { NextResponse } from "next/server"
import { createDoublesRuntimeClient } from "@/lib/doublesParticipantServer"
import { provisionalDoublesState } from "@/lib/doublesMatchPlay"

export const runtime = "nodejs"

export async function GET() {
  const client = createDoublesRuntimeClient()
  const fixtures = await client.from("doubles_managed_fixtures").select("id,season_id,division,game_number,home_season_team_id,away_season_team_id,home_team_name_snapshot,away_team_name_snapshot,home_course,away_course,arranged_at,status,due_at,published_at").in("status", ["SCHEDULED", "LIVE", "COMPLETED"]).not("published_at", "is", null).order("season_id", { ascending: false }).order("division").order("game_number")
  if (fixtures.error) return NextResponse.json({ error: "Doubles live scoring is temporarily unavailable" }, { status: 503 })
  const ids = (fixtures.data || []).map((fixture) => fixture.id)
  if (!ids.length) return NextResponse.json({ groups: [] }, { headers: { "Cache-Control": "no-store, max-age=15" } })
  const [drafts, results] = await Promise.all([
    client.from("doubles_team_course_drafts").select("fixture_id,season_team_id,course_slot,course_name,home_holes_won,away_holes_won,status").in("fixture_id", ids),
    client.from("doubles_managed_results").select("fixture_id,home_course_home_holes,home_course_away_holes,away_course_home_holes,away_course_away_holes,home_holes_won,away_holes_won,home_points,away_points,outcome,status").in("fixture_id", ids),
  ])
  if (drafts.error || results.error) return NextResponse.json({ error: "Doubles live scoring is temporarily unavailable" }, { status: 503 })
  const resultByFixture = new Map((results.data || []).map((row) => [row.fixture_id, row]))
  const groups = new Map<string, { division: string; fixtures: Array<Record<string, unknown>> }>()
  for (const fixture of fixtures.data || []) {
    const rows = (drafts.data || []).filter((draft) => draft.fixture_id === fixture.id)
    const homeSubmitted = rows.filter((draft) => draft.season_team_id === fixture.home_season_team_id && draft.status === "SUBMITTED").length === 2
    const awaySubmitted = rows.filter((draft) => draft.season_team_id === fixture.away_season_team_id && draft.status === "SUBMITTED").length === 2
    const homeOverall = rows.filter((draft) => draft.season_team_id === fixture.home_season_team_id && draft.status === "SUBMITTED").reduce((sum, row) => sum + Number(row.home_holes_won || 0), 0)
    const awayOverall = rows.filter((draft) => draft.season_team_id === fixture.away_season_team_id && draft.status === "SUBMITTED").reduce((sum, row) => sum + Number(row.away_holes_won || 0), 0)
    const result = resultByFixture.get(fixture.id)
    const state = result ? "VERIFIED" : provisionalDoublesState({ homeSubmitted, awaySubmitted, homeCourseComplete: rows.filter((row) => row.course_slot === "HOME_TEAM_COURSE" && row.status === "SUBMITTED").length === 2, awayCourseComplete: rows.filter((row) => row.course_slot === "AWAY_TEAM_COURSE" && row.status === "SUBMITTED").length === 2, homeOverall: homeSubmitted ? homeOverall : null, awayOverall: awaySubmitted ? awayOverall : null })
    const group = groups.get(fixture.division) || { division: fixture.division, fixtures: [] as Array<Record<string, unknown>> }
    group.fixtures.push({ ...fixture, state, drafts: rows, result: result || null })
    groups.set(fixture.division, group)
  }
  return NextResponse.json({ groups: Array.from(groups.values()) }, { headers: { "Cache-Control": "no-store, max-age=15" } })
}
