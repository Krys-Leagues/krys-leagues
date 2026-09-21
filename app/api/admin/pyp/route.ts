import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createAdminServiceClient } from "@/lib/admin/adminServiceClient"

export const runtime = "nodejs"

const RPCS = new Set([
  "approve_pyp_final_scorecard",
  "approve_pyp_roster_version",
  "create_pyp_season_with_roster",
  "delete_pyp_result",
  "generate_pyp_final_scorecard",
  "generate_pyp_next_season_proposal",
  "generate_pyp_schedule",
  "rebuild_pyp_standings",
  "review_pyp_schedule",
  "resize_pyp_season_divisions",
  "save_pyp_result",
  "set_pyp_division_roster_slots",
  "set_pyp_return_decision",
  "update_pyp_season_details",
])

function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }) }
function fail(message: string, status = 400) { return json({ error: message }, status) }

async function rpc(authorization: Extract<Awaited<ReturnType<typeof authorizeSiteAdminMutation>>, { authorized: true }>, body: Record<string, unknown>) {
  const name = String(body.name || "")
  if (!RPCS.has(name)) throw new Error("That PYP RPC is not in the approved family contract.")
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
    const client = createAdminServiceClient()
    const seasonId = String(body.seasonId || "").trim()

    if (action === "setup_load") {
      const division = Number(body.division)
      const [season, roster] = await Promise.all([
        client.from("seasons").select("season_number, start_date, end_date, league_type").eq("id", seasonId).maybeSingle(),
        client.from("pyp_roster_versions").select("id, division_count, status").eq("season_id", seasonId).in("status", ["draft", "approved", "locked"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ])
      if (season.error) throw season.error
      if (roster.error) throw roster.error
      if (!season.data || season.data.league_type !== "pyp" || !roster.data) return fail("Managed PYP season was not found.")
      if (!Number.isInteger(division) || division < 1 || division > roster.data.division_count) return fail(`Division must be between 1 and ${roster.data.division_count}.`)
      const slots = await client.from("pyp_division_roster_slots").select("slot_number, player_id, player_screen_name").eq("roster_version_id", roster.data.id).eq("division_number", division).order("slot_number")
      if (slots.error) throw slots.error
      const ids = (slots.data || []).map((slot) => slot.player_id).filter((id): id is string => Boolean(id))
      const [activePlayers, selectedPlayers] = await Promise.all([
        client.from("players").select("id, screen_name").eq("active", true).order("screen_name"),
        ids.length ? client.from("players").select("id, screen_name").in("id", ids) : Promise.resolve({ data: [], error: null }),
      ])
      if (activePlayers.error) throw activePlayers.error
      if (selectedPlayers.error) throw selectedPlayers.error
      const playerMap = new Map<string, { id: string; screen_name: string }>()
      for (const player of [...(activePlayers.data || []), ...(selectedPlayers.data || [])]) playerMap.set(player.id, player)
      return json({ data: { season: season.data, roster: roster.data, slots: slots.data || [], players: Array.from(playerMap.values()).sort((a, b) => a.screen_name.localeCompare(b.screen_name)) } })
    }

    if (action === "schedule_load") {
      const [season, roster, state, fixtures, results] = await Promise.all([
        client.from("seasons").select("season_number, start_date, end_date, league_type").eq("id", seasonId).maybeSingle(),
        client.from("pyp_roster_versions").select("status, division_count").eq("season_id", seasonId).in("status", ["draft", "approved", "locked"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        client.from("pyp_schedule_state").select("change_revision, generated_revision, reviewed_revision").eq("season_id", seasonId).maybeSingle(),
        client.from("schedule").select("id, division_number, game_number, pyp_home_player_screen_name, pyp_away_player_screen_name").eq("league_type", "pyp").eq("season_id", seasonId).not("pyp_roster_version_id", "is", null).order("division_number").order("game_number"),
        client.from("pyp_managed_results").select("schedule_id,course1_name,course1_difficulty,course1_home_hw,course1_away_hw,course2_name,course2_difficulty,course2_home_hw,course2_away_hw,home_total_hw,away_total_hw").eq("season_id", seasonId),
      ])
      const error = [season, roster, state, fixtures, results].find((item) => item.error)?.error
      if (error) throw error
      if (!season.data || season.data.league_type !== "pyp" || !roster.data) return fail("Managed PYP season was not found.")
      return json({ data: { season: season.data, roster: roster.data, scheduleState: state.data, fixtures: fixtures.data || [], results: results.data || [] } })
    }

    if (action === "results_load") {
      const [fixtures, results] = await Promise.all([
        client.from("schedule").select("id,division_number,game_number,pyp_home_player_screen_name,pyp_away_player_screen_name").eq("league_type", "pyp").eq("season_id", seasonId).not("pyp_roster_version_id", "is", null).order("division_number").order("game_number"),
        client.from("pyp_managed_results").select("id,schedule_id,course1_name,course1_difficulty,course1_home_hw,course1_away_hw,course2_name,course2_difficulty,course2_home_hw,course2_away_hw,home_total_hw,away_total_hw,is_draw").eq("season_id", seasonId),
      ])
      if (fixtures.error) throw fixtures.error
      if (results.error) throw results.error
      return json({ data: { fixtures: fixtures.data || [], results: results.data || [] } })
    }

    if (action === "standings_load") {
      const [season, roster, card] = await Promise.all([
        client.from("seasons").select("season_number,due_date,end_date,league_type").eq("id", seasonId).maybeSingle(),
        client.from("pyp_roster_versions").select("id,status,division_count").eq("season_id", seasonId).in("status", ["draft", "approved", "locked"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        client.from("pyp_final_scorecards").select("id,status,source_roster_version_id").eq("season_id", seasonId).in("status", ["draft", "approved"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ])
      if (season.error) throw season.error
      if (roster.error) throw roster.error
      if (card.error) throw card.error
      if (!season.data || season.data.league_type !== "pyp" || !roster.data) return fail("Managed PYP season was not found.")
      if (roster.data.status === "approved" && card.data?.status !== "approved") {
        for (let division = 1; division <= roster.data.division_count; division += 1) {
          const result = await authorization.supabase.rpc("rebuild_pyp_standings", { p_season_id: seasonId, p_division_number: division })
          if (result.error) throw result.error
        }
      }
      const [slots, standings, entries, details] = await Promise.all([
        client.from("pyp_division_roster_slots").select("division_number,player_id,player_screen_name").eq("roster_version_id", roster.data.id).not("player_id", "is", null),
        client.from("season_standings").select("player_id,division,points,wins,losses,ties,strokes,rank").eq("league_type", "pyp").eq("season_number", season.data.season_number),
        card.data ? client.from("pyp_final_scorecard_entries").select("id,division_number,division_rank,player_id,player_screen_name,completed_game_count,wins,losses,ties,points,holes_won").eq("scorecard_id", card.data.id).order("division_number").order("division_rank") : Promise.resolve({ data: [], error: null }),
        card.data ? client.from("pyp_final_scorecard_fixture_details").select("id,player_id,game_number,opponent_screen_name,player_role,course1_name,course1_difficulty,course1_player_hw,course1_opponent_hw,course2_name,course2_difficulty,course2_player_hw,course2_opponent_hw,player_total_hw,opponent_total_hw,outcome").eq("scorecard_id", card.data.id).order("game_number") : Promise.resolve({ data: [], error: null }),
      ])
      const error = [slots, standings, entries, details].find((item) => item.error)?.error
      if (error) throw error
      return json({ data: { season: season.data, roster: roster.data, card: card.data, slots: slots.data || [], standings: standings.data || [], entries: entries.data || [], details: details.data || [] } })
    }

    if (action === "transition_load") {
      const requestedId = String(body.scorecardId || "").trim()
      const [scorecard, sourceSeason, entries, decisions, seasons, players] = await Promise.all([
        client.from("pyp_final_scorecards").select("id,season_id,status,source_roster_version_id,created_at,approved_at").eq("id", requestedId).maybeSingle(),
        client.from("seasons").select("id,season_number,start_date,end_date").eq("id", requestedId).maybeSingle(),
        client.from("pyp_final_scorecard_entries").select("id,division_number,division_rank,player_id,player_screen_name,completed_game_count,wins,losses,ties,points,holes_won").eq("scorecard_id", requestedId).order("division_number").order("division_rank"),
        client.from("pyp_final_scorecard_player_decisions").select("player_id, decision").eq("final_scorecard_id", requestedId),
        client.from("seasons").select("id,season_number,start_date,end_date").eq("league_type", "pyp").is("division", null).order("season_number", { ascending: false }),
        client.from("players").select("id,screen_name").eq("active", true).order("screen_name"),
      ])
      if (scorecard.error) throw scorecard.error
      if (sourceSeason.error) throw sourceSeason.error
      if (entries.error) throw entries.error
      if (decisions.error) throw decisions.error
      if (seasons.error) throw seasons.error
      if (players.error) throw players.error
      if (!scorecard.data) return fail("PYP scorecard was not found.")
      const sourceSeasonData = sourceSeason.data
      const candidates = sourceSeasonData ? (seasons.data || []).filter((season) => season.season_number === sourceSeasonData.season_number + 1) : []
      const rosters = candidates.length ? await client.from("pyp_roster_versions").select("id,season_id,division_count,status,source_final_scorecard_id").in("season_id", candidates.map((season) => season.id)).in("status", ["draft", "approved"]) : { data: [], error: null }
      if (rosters.error) throw rosters.error
      const targetRoster = (rosters.data || []).find((roster) => roster.source_final_scorecard_id === requestedId) || null
      const targetSlots = targetRoster ? await client.from("pyp_division_roster_slots").select("division_number,slot_number,player_id,player_screen_name").eq("roster_version_id", targetRoster.id).order("division_number").order("slot_number") : { data: [], error: null }
      if (targetSlots.error) throw targetSlots.error
      return json({ data: { scorecard: scorecard.data, sourceSeason: sourceSeasonData, entries: entries.data || [], decisions: decisions.data || [], seasons: candidates, players: players.data || [], roster: targetRoster, slots: targetSlots.data || [] } })
    }

    if (action === "season_edit_load") {
      const seasons = await client.from("seasons").select("id, season_number, is_active, is_locked, start_date, end_date").ilike("league_type", "pyp").is("division", null).order("season_number", { ascending: false })
      if (seasons.error) throw seasons.error
      const rosters = seasons.data?.length ? await client.from("pyp_roster_versions").select("season_id, division_count, status").in("season_id", seasons.data.map((season) => season.id)).in("status", ["draft", "approved", "locked"]).order("created_at", { ascending: false }) : { data: [], error: null }
      if (rosters.error) throw rosters.error
      return json({ data: { seasons: seasons.data || [], rosters: rosters.data || [] } })
    }

    if (action === "rpc") return json({ data: await rpc(authorization, body) })
    return fail("Unsupported PYP admin action.")
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "PYP admin action failed." }, 400)
  }
}
