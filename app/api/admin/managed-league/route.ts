import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createAdminServiceClient } from "@/lib/admin/adminServiceClient"

export const runtime = "nodejs"

const RPCS = new Set([
  "approve_match_final_scorecard", "approve_match_roster_version", "approve_stroke_final_scorecard", "approve_stroke_roster_version",
  "create_match_season_with_roster", "create_stroke_season_with_roster", "delete_match_result", "delete_stroke_result",
  "generate_match_final_scorecard", "generate_match_next_season_proposal", "generate_match_schedule", "generate_stroke_final_scorecard",
  "generate_stroke_next_season_proposal", "generate_stroke_schedule", "rebuild_match_standings", "rebuild_stroke_standings", "review_match_schedule", "review_stroke_schedule",
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
    if (action === "season_edit_load") {
      if (league !== "stroke" && league !== "match") return fail("Managed league is required.")
      const client = createAdminServiceClient()
      const seasons = await client.from("seasons").select("id, season_number, is_active, is_locked, start_date, due_date, end_date, game1_course, game2_course, game3_course").ilike("league_type", league).is("division", null).order("is_active", { ascending: false }).order("season_number", { ascending: false })
      if (seasons.error) throw seasons.error
      const table = `${league}_roster_versions`
      const rosters = seasons.data?.length ? await client.from(table).select("id, season_id, division_count, status").in("season_id", seasons.data.map((season) => season.id)).in("status", ["draft", "approved", "locked"]) : { data: [], error: null }
      if (rosters.error) throw rosters.error
      return json({ data: { seasons: seasons.data || [], rosters: rosters.data || [] } })
    }
    if (action === "setup_load") {
      if (league !== "stroke" && league !== "match") return fail("Managed league is required.")
      const client = createAdminServiceClient()
      const seasonId = String(body.seasonId || "").trim()
      const division = Number(body.division)
      const season = await client.from("seasons").select("id, league_type, season_number, start_date, due_date, end_date, game1_course, game2_course, game3_course").eq("id", seasonId).maybeSingle()
      if (season.error) throw season.error
      const rosterTable = `${league}_roster_versions`
      const rosters = await client.from(rosterTable).select("id, division_count, status").eq("season_id", seasonId).in("status", ["draft", "approved", "locked"])
      if (rosters.error) throw rosters.error
      const selected = (rosters.data || []).find((item) => item.status === "draft") || (rosters.data || []).find((item) => item.status === "approved") || (rosters.data || []).find((item) => item.status === "locked")
      if (!season.data || !selected) return fail("Managed roster was not found.", 404)
      const [state, slots, overrides, activePlayers] = await Promise.all([
        client.from(`${league}_schedule_state`).select("change_revision, generated_revision, reviewed_revision, posted_revision").eq("season_id", seasonId).maybeSingle(),
        client.from(`${league}_division_roster_slots`).select("id, slot_number, player_id, player_screen_name, slot_status").eq("roster_version_id", selected.id).eq("division_number", division).order("slot_number", { ascending: true }),
        client.from(`${league}_division_course_overrides`).select("game1_course_override, game2_course_override, game3_course_override").eq("season_id", seasonId).eq("division_number", division).maybeSingle(),
        client.from("players").select("id, screen_name").eq("active", true).order("screen_name"),
      ])
      const error = [state, slots, overrides, activePlayers].find((item) => item.error)?.error
      if (error) throw error
      const ids = (slots.data || []).map((slot) => slot.player_id).filter((id): id is string => Boolean(id))
      const rosterPlayers = ids.length ? await client.from("players").select("id, screen_name").in("id", ids) : { data: [], error: null }
      if (rosterPlayers.error) throw rosterPlayers.error
      const playerMap = new Map<string, { id: string; screen_name: string }>()
      for (const player of [...(activePlayers.data || []), ...(rosterPlayers.data || [])]) playerMap.set(player.id, player)
      return json({ data: { season: season.data, roster: selected, state: state.data, slots: slots.data || [], overrides: overrides.data, players: Array.from(playerMap.values()).sort((a, b) => a.screen_name.localeCompare(b.screen_name)) } })
    }
    if (action === "transition_load") {
      if (league !== "stroke" && league !== "match") return fail("Managed league is required.")
      const client = createAdminServiceClient()
      const scorecardId = String(body.scorecardId || "")
      const scorecard = await client.from(`${league}_final_scorecards`).select("id, season_id, status").eq("id", scorecardId).maybeSingle()
      if (scorecard.error) throw scorecard.error
      if (!scorecard.data || scorecard.data.status !== "approved") return fail("An approved Final Scorecard is required.", 400)
      const sourceSeason = await client.from("seasons").select("season_number").eq("id", scorecard.data.season_id).maybeSingle()
      if (sourceSeason.error) throw sourceSeason.error
      if (!sourceSeason.data) return fail("Source season not found.", 404)
      const [entries, decisions, candidateSeasons, players] = await Promise.all([
        client.from(`${league}_final_scorecard_entries`).select("player_id, player_screen_name, division_number, division_rank, completed_game_count").eq("scorecard_id", scorecardId).order("division_number").order("division_rank"),
        client.from(`${league}_final_scorecard_player_decisions`).select("player_id, decision").eq("final_scorecard_id", scorecardId),
        client.from("seasons").select("id, season_number, start_date, end_date, game1_course, game2_course, game3_course").eq("league_type", league).is("division", null).eq("season_number", sourceSeason.data.season_number + 1),
        client.from("players").select("id, screen_name").eq("active", true).order("screen_name"),
      ])
      const loadError = [entries, decisions, candidateSeasons, players].find((item) => item.error)?.error
      if (loadError) throw loadError
      const rosterTable = `${league}_roster_versions`
      const rosters = candidateSeasons.data?.length ? await client.from(rosterTable).select("id, season_id, division_count, source_final_scorecard_id").in("season_id", candidateSeasons.data.map((season) => season.id)).in("status", ["draft", "approved"]) : { data: [], error: null }
      if (rosters.error) throw rosters.error
      const target = (rosters.data || []).find((roster) => roster.source_final_scorecard_id === scorecardId)
      const slots = target ? await client.from(`${league}_division_roster_slots`).select("division_number, slot_number, player_id, player_screen_name").eq("roster_version_id", target.id).order("division_number").order("slot_number") : { data: [], error: null }
      if (slots.error) throw slots.error
      return json({ data: { scorecard: scorecard.data, sourceSeason: sourceSeason.data, entries: entries.data || [], decisions: decisions.data || [], candidateSeasons: candidateSeasons.data || [], rosters: rosters.data || [], slots: slots.data || [], players: players.data || [] } })
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
    if (action === "standings_load") {
      if (league !== "stroke" && league !== "match") return fail("Managed league is required.")
      const client = createAdminServiceClient()
      const seasons = await client.from("seasons").select("id, season_number, is_active, due_date, end_date").eq("league_type", league).is("division", null).order("is_active", { ascending: false }).order("season_number", { ascending: false })
      if (seasons.error) throw seasons.error
      const seasonIds = (seasons.data || []).map((season) => season.id)
      const rosterTable = `${league}_roster_versions`
      const rosters = seasonIds.length ? await client.from(rosterTable).select("id, season_id, division_count, status").in("season_id", seasonIds).in("status", ["draft", "approved", "locked"]) : { data: [], error: null }
      if (rosters.error) throw rosters.error
      const seasonId = String(body.seasonId || "").trim()
      if (!seasonId) return json({ data: { seasons: seasons.data || [], rosters: rosters.data || [] } })
      const activeSeason = (seasons.data || []).find((season) => season.id === seasonId)
      const roster = (rosters.data || []).find((item) => item.season_id === seasonId && item.status !== "locked") || (rosters.data || []).find((item) => item.season_id === seasonId)
      if (!activeSeason || !roster) return fail("Managed season was not found.", 404)
      const division = Number(body.division || 1)
      const standings = await client.from("season_standings").select("player_id, points, wins, losses, ties, strokes, rank").eq("league_type", league).eq("division", `${league === "stroke" ? "Stroke" : "Match"} D${division}`).eq("season_number", activeSeason.season_number).order("rank", { ascending: true })
      if (standings.error) throw standings.error
      const playerIds = (standings.data || []).map((row) => row.player_id)
      let playerNames: unknown[] = []
      if (league === "stroke" && playerIds.length) {
        const players = await client.from("players").select("id, screen_name").in("id", playerIds)
        if (players.error) throw players.error
        playerNames = players.data || []
      }
      if (league === "match") {
        const slots = await client.from("match_division_roster_slots").select("player_id, player_screen_name").eq("roster_version_id", roster.id).eq("division_number", division).not("player_id", "is", null)
        if (slots.error) throw slots.error
        playerNames = slots.data || []
      }
      const scorecards = await client.from(`${league}_final_scorecards`).select("id, season_id, source_roster_version_id, status, approved_at, approval_note").eq("season_id", seasonId).in("status", ["draft", "approved"])
      if (scorecards.error) throw scorecards.error
      const selected = (scorecards.data || []).find((item) => item.status === "approved") || (scorecards.data || []).find((item) => item.status === "draft") || null
      let entries: unknown[] = []
      let totalFixtures = 0
      let completedFixtures = 0
      if (selected) {
        const entrySelect = league === "stroke"
          ? "id, division_number, division_rank, player_id, player_screen_name, completed_game_count, wins, losses, ties, points, strokes"
          : "id, division_number, division_rank, player_id, player_screen_name, completed_game_count, wins, losses, ties, points, holes_won, game1_course, game1_outcome, game1_hw, game2_course, game2_outcome, game2_hw, game3_course, game3_outcome, game3_hw"
        const scoreEntries = await client.from(`${league}_final_scorecard_entries`).select(entrySelect).eq("scorecard_id", selected.id).order("division_number", { ascending: true }).order("division_rank", { ascending: true })
        if (scoreEntries.error) throw scoreEntries.error
        entries = scoreEntries.data || []
        const fixtures = await client.from("schedule").select("id").eq("league_type", league).eq("season_id", seasonId).eq(league === "stroke" ? "roster_version_id" : "match_roster_version_id", selected.source_roster_version_id)
        if (fixtures.error) throw fixtures.error
        const ids = (fixtures.data || []).map((row) => row.id)
        totalFixtures = ids.length
        if (ids.length) {
          const results = await client.from("results").select(league === "stroke" ? "schedule_id, player1_score, player2_score" : "schedule_id, player1_hw, player2_hw").eq("league_type", league).in("schedule_id", ids)
          if (results.error) throw results.error
          completedFixtures = (results.data || []).filter((result) => {
            const row = result as Record<string, unknown>
            return league === "stroke" ? row.player1_score !== null && row.player2_score !== null : row.player1_hw !== null && row.player2_hw !== null
          }).length
        }
      }
      return json({ data: { seasons: seasons.data || [], rosters: rosters.data || [], standings: standings.data || [], playerNames, scorecard: selected, entries, totalFixtures, completedFixtures } })
    }
    if (action === "schedule_load") {
      if (league !== "stroke" && league !== "match") return fail("Managed league is required.")
      const client = createAdminServiceClient()
      const seasonId = String(body.seasonId || "").trim()
      if (!seasonId) return fail("A season is required.")
      const season = await client.from("seasons").select("id, league_type, season_number, start_date, due_date, end_date, game1_course, game2_course, game3_course").eq("id", seasonId).maybeSingle()
      if (season.error) throw season.error
      const rosterTable = `${league}_roster_versions`
      const rosters = await client.from(rosterTable).select("id, division_count, status").eq("season_id", seasonId).in("status", ["draft", "approved", "locked"])
      if (rosters.error) throw rosters.error
      const selected = (rosters.data || []).find((item) => item.status === "approved") || (rosters.data || []).find((item) => item.status === "locked") || (rosters.data || []).find((item) => item.status === "draft")
      if (!season.data || !selected) return fail("Managed roster was not found.", 404)
      const [state, fixtures, slots, overrides] = await Promise.all([
        client.from(`${league}_schedule_state`).select("change_revision, generated_revision, reviewed_revision, posted_revision").eq("season_id", seasonId).maybeSingle(),
        client.from("schedule").select("id, division_number, division, game_number, game, course, player1, player2, player1_name, player2_name, player1_id, player2_id, status, due_date").eq("league_type", league).eq("season_id", seasonId).order("division_number", { ascending: true }).order("game_number", { ascending: true }).order("id", { ascending: true }),
        client.from(`${league}_division_roster_slots`).select("division_number, slot_number, player_id, player_screen_name").eq("roster_version_id", selected.id).order("division_number", { ascending: true }).order("slot_number", { ascending: true }),
        client.from(`${league}_division_course_overrides`).select("division_number, game1_course_override, game2_course_override, game3_course_override").eq("season_id", seasonId).order("division_number", { ascending: true }),
      ])
      const error = [state, fixtures, slots, overrides].find((item) => item.error)?.error
      if (error) throw error
      const ids = (fixtures.data || []).map((fixture) => fixture.id)
      const results = ids.length ? await client.from("results").select(league === "stroke" ? "schedule_id, player1_score, player2_score" : "schedule_id, player1_hw, player2_hw").eq("league_type", league).in("schedule_id", ids) : { data: [], error: null }
      if (results.error) throw results.error
      return json({ data: { season: season.data, roster: selected, scheduleState: state.data, fixtures: fixtures.data || [], slots: slots.data || [], overrides: overrides.data || [], results: results.data || [] } })
    }
    if (action === "rpc") return json({ data: await runRpc(authorization, body) })
    return fail("Unsupported managed-league admin action.")
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Managed-league admin action failed." }, 400)
  }
}
