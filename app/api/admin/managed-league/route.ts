import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createAdminServiceClient } from "@/lib/admin/adminServiceClient"

export const runtime = "nodejs"

const RPCS = new Set([
  "approve_match_final_scorecard", "approve_match_roster_version", "approve_stroke_final_scorecard", "approve_stroke_roster_version",
  "create_match_season_with_roster", "create_stroke_season_with_roster", "delete_match_result", "delete_stroke_result",
  "generate_match_final_scorecard", "generate_match_next_season_proposal", "generate_match_schedule", "generate_stroke_final_scorecard",
  "generate_stroke_next_season_proposal", "generate_stroke_schedule", "rebuild_match_standings", "rebuild_stroke_standings",
  "resize_match_season_divisions", "resize_stroke_season_divisions", "save_match_result", "save_stroke_result",
  "set_match_division_course_overrides", "set_match_division_roster_slots", "set_match_return_decision", "set_stroke_division_course_overrides",
  "set_stroke_division_roster_slots", "set_stroke_return_decision", "update_match_season_details", "update_stroke_season_details",
])

function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }) }
function fail(message: string, status = 400) { return json({ error: message }, status) }

async function runRpc(authorization: Extract<Awaited<ReturnType<typeof authorizeSiteAdminMutation>>, { authorized: true }>, body: Record<string, unknown>) {
  const name = String(body.name || "")
  if (!RPCS.has(name)) throw new Error("That managed-league RPC is not in the approved family contract.")
  const result = await authorization.supabase.rpc(name, (body.args || {}) as Record<string, unknown>)
  if (result.error) throw result.error
  return result.data
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    const body = await request.json() as Record<string, unknown>
    const action = String(body.action || "")
    const league = String(body.league || "")
    if (action === "hub_load") {
      if (league !== "stroke" && league !== "match") return fail("Managed league is required.")
      const client = createAdminServiceClient()
      const seasons = await client.from("seasons").select("id, season_number, is_active").eq("league_type", league).is("division", null).order("is_active", { ascending: false }).order("season_number", { ascending: false })
      if (seasons.error) throw seasons.error
      const rosterTable = `${league}_roster_versions`
      const rosters = seasons.data?.length ? await client.from(rosterTable).select("season_id, status").in("season_id", seasons.data.map((season) => season.id)).in("status", ["draft", "approved", "locked"]) : { data: [], error: null }
      if (rosters.error) throw rosters.error
      return json({ data: { seasons: seasons.data || [], rosters: rosters.data || [] } })
    }
    if (action === "results_load") {
      if (league !== "stroke" && league !== "match") return fail("Managed league is required.")
      const client = createAdminServiceClient()
      const rosterTable = `${league}_roster_versions`
      const seasons = await client.from("seasons").select("id, season_number, is_active").eq("league_type", league).is("division", null).order("is_active", { ascending: false }).order("season_number", { ascending: false })
      if (seasons.error) throw seasons.error
      const seasonIds = (seasons.data || []).map((season) => season.id)
      const rosters = seasonIds.length ? await client.from(rosterTable).select("season_id, id").in("season_id", seasonIds).in("status", league === "match" ? ["approved", "locked"] : ["approved"]) : { data: [], error: null }
      if (rosters.error) throw rosters.error
      const managed = (seasons.data || []).filter((season) => (rosters.data || []).some((roster) => roster.season_id === season.id))
      const seasonId = String(body.seasonId || "").trim()
      let fixtures: unknown[] = []
      let results: unknown[] = []
      if (seasonId) {
        const roster = (rosters.data || []).find((item) => item.season_id === seasonId && (league === "match" ? item.id : true))
        const schedule = client.from("schedule").select("id, season_id, division_number, division, game_number, game, course, player1, player2, player1_name, player2_name, player1_id, player2_id").eq("league_type", league).eq("season_id", seasonId).not("division_number", "is", null).not("game_number", "is", null).not("player1_id", "is", null).not("player2_id", "is", null).order("division_number", { ascending: true }).order("game_number", { ascending: true }).order("id", { ascending: true })
        if (league === "stroke") schedule.not("roster_version_id", "is", null)
        if (league === "match" && roster?.id) schedule.eq("match_roster_version_id", roster.id)
        const scheduleResult = await schedule
        if (scheduleResult.error) throw scheduleResult.error
        fixtures = scheduleResult.data || []
        const ids = fixtures.map((fixture) => (fixture as { id: string }).id)
        if (ids.length) {
          const result = await client.from("results").select(league === "stroke" ? "schedule_id, player1_score, player2_score" : "schedule_id, player1_hw, player2_hw").eq("league_type", league).in("schedule_id", ids)
          if (result.error) throw result.error
          results = result.data || []
        }
      }
      let publicMatch: unknown = null
      if (league === "match") {
        const result = await client.rpc("get_public_match_play")
        if (result.error) throw result.error
        publicMatch = result.data
      }
      return json({ data: { seasons: managed, fixtures, results, publicMatch } })
    }
    if (action === "rpc") return json({ data: await runRpc(authorization, body) })
    return fail("Unsupported managed-league admin action.")
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Managed-league admin action failed." }, 400)
  }
}
