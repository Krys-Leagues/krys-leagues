import "server-only"

import { createClient } from "@supabase/supabase-js"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function pypAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("PYP admin server access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const params = new URL(request.url).searchParams
  const resource = params.get("resource")
  const seasonId = params.get("seasonId")?.trim() || null
  const scorecardId = params.get("scorecardId")?.trim() || null

  try {
    const supabase = pypAdminClient()

    if (resource === "hub" || resource === "season-edit") {
      const seasons = await supabase
        .from("seasons")
        .select("id, season_number, is_active, is_locked, start_date, end_date")
        .ilike("league_type", "pyp")
        .is("division", null)
        .order(resource === "hub" ? "is_active" : "season_number", { ascending: false })
        .order("season_number", { ascending: false })
      if (seasons.error) return json({ error: seasons.error.message }, 503)
      if ((seasons.data || []).length === 0) return json({ seasons: [], rosters: [] })

      const rosterFields = resource === "hub" ? "season_id, status" : "season_id, division_count, status"
      const rosters = await supabase
        .from("pyp_roster_versions")
        .select(rosterFields)
        .in("season_id", (seasons.data || []).map((season) => season.id))
        .in("status", ["draft", "approved", "locked"])
        .order("created_at", { ascending: false })
      if (rosters.error) return json({ error: rosters.error.message }, 503)
      return json({ seasons: seasons.data || [], rosters: rosters.data || [] })
    }

    if (resource === "setup") {
      if (!seasonId) return json({ error: "seasonId is required." }, 400)
      const division = Number(params.get("division"))
      if (!Number.isInteger(division) || division < 1) return json({ error: "division must be a positive integer." }, 400)

      const season = await supabase
        .from("seasons")
        .select("season_number, start_date, end_date, league_type")
        .eq("id", seasonId)
        .maybeSingle()
      const roster = await supabase
        .from("pyp_roster_versions")
        .select("id, division_count, status")
        .eq("season_id", seasonId)
        .in("status", ["draft", "approved", "locked"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (season.error || roster.error) return json({ error: season.error?.message || roster.error?.message }, 503)
      if (!season.data || !roster.data) return json({ error: "Managed PYP season or roster not found." }, 404)
      const slots = await supabase
        .from("pyp_division_roster_slots")
        .select("slot_number, player_id, player_screen_name")
        .eq("roster_version_id", roster.data.id)
        .eq("division_number", division)
        .order("slot_number")
      if (slots.error) return json({ error: slots.error.message }, 503)
      return json({ season: season.data, roster: roster.data, slots: slots.data || [] })
    }

    if (resource === "players") {
      if (!seasonId) return json({ error: "seasonId is required." }, 400)
      const season = await supabase
        .from("seasons")
        .select("id, season_number, league_type")
        .eq("id", seasonId)
        .maybeSingle()
      const rosters = await supabase
        .from("pyp_roster_versions")
        .select("id, division_count, status")
        .eq("season_id", seasonId)
        .in("status", ["draft", "approved", "locked"])
        .order("created_at", { ascending: false })
      if (season.error || rosters.error) return json({ error: season.error?.message || rosters.error?.message }, 503)
      const rosterIds = (rosters.data || []).map((roster) => roster.id)
      const slots = rosterIds.length === 0
        ? { data: [], error: null }
        : await supabase
            .from("pyp_division_roster_slots")
            .select("player_id, player_screen_name, division_number, slot_number, roster_version_id")
            .in("roster_version_id", rosterIds)
            .not("player_id", "is", null)
            .order("division_number", { ascending: true })
            .order("slot_number", { ascending: true })
      if (slots.error) return json({ error: slots.error.message }, 503)
      return json({ season: season.data, rosters: rosters.data || [], slots: slots.data || [] })
    }

    if (resource === "schedule") {
      if (!seasonId) return json({ error: "seasonId is required." }, 400)
      const [season, roster, state, fixtures, results] = await Promise.all([
        supabase.from("seasons").select("season_number, start_date, end_date, league_type").eq("id", seasonId).maybeSingle(),
        supabase.from("pyp_roster_versions").select("status, division_count").eq("season_id", seasonId).in("status", ["draft", "approved", "locked"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("pyp_schedule_state").select("change_revision, generated_revision, reviewed_revision").eq("season_id", seasonId).maybeSingle(),
        supabase.from("schedule").select("id, division_number, game_number, pyp_home_player_screen_name, pyp_away_player_screen_name").eq("league_type", "pyp").eq("season_id", seasonId).not("pyp_roster_version_id", "is", null).order("division_number").order("game_number"),
        supabase.from("pyp_managed_results").select("schedule_id,course1_name,course1_difficulty,course1_home_hw,course1_away_hw,course2_name,course2_difficulty,course2_home_hw,course2_away_hw,home_total_hw,away_total_hw").eq("season_id", seasonId),
      ])
      const error = season.error || roster.error || state.error || fixtures.error || results.error
      if (error) return json({ error: error.message }, 503)
      return json({ season: season.data, roster: roster.data, scheduleState: state.data, fixtures: fixtures.data || [], results: results.data || [] })
    }

    if (resource === "results") {
      if (!seasonId) return json({ error: "seasonId is required." }, 400)
      const [fixtures, results] = await Promise.all([
        supabase.from("schedule").select("id,division_number,game_number,pyp_home_player_screen_name,pyp_away_player_screen_name").eq("league_type", "pyp").eq("season_id", seasonId).not("pyp_roster_version_id", "is", null).order("division_number").order("game_number"),
        supabase.from("pyp_managed_results").select("id,schedule_id,course1_name,course1_difficulty,course1_home_hw,course1_away_hw,course2_name,course2_difficulty,course2_home_hw,course2_away_hw,home_total_hw,away_total_hw,is_draw").eq("season_id", seasonId),
      ])
      const error = fixtures.error || results.error
      if (error) return json({ error: error.message }, 503)
      return json({ fixtures: fixtures.data || [], results: results.data || [] })
    }

    if (resource === "standings") {
      if (!seasonId) return json({ error: "seasonId is required." }, 400)
      const [season, roster, card] = await Promise.all([
        supabase.from("seasons").select("season_number,due_date,end_date,league_type").eq("id", seasonId).maybeSingle(),
        supabase.from("pyp_roster_versions").select("id,status,division_count").eq("season_id", seasonId).in("status", ["draft", "approved", "locked"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("pyp_final_scorecards").select("id,status,source_roster_version_id").eq("season_id", seasonId).in("status", ["draft", "approved"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ])
      const error = season.error || roster.error || card.error
      if (error || !season.data || !roster.data) return json({ error: error?.message || "Managed PYP season was not found." }, error ? 503 : 404)
      const [slots, standings, entries, details] = await Promise.all([
        supabase.from("pyp_division_roster_slots").select("division_number,player_id,player_screen_name").eq("roster_version_id", roster.data.id).not("player_id", "is", null),
        supabase.from("season_standings").select("player_id,division,points,wins,losses,ties,strokes,rank").eq("league_type", "pyp").eq("season_number", season.data.season_number),
        card.data ? supabase.from("pyp_final_scorecard_entries").select("id,division_number,division_rank,player_id,player_screen_name,completed_game_count,wins,losses,ties,points,holes_won").eq("scorecard_id", card.data.id).order("division_number").order("division_rank") : Promise.resolve({ data: [], error: null }),
        card.data ? supabase.from("pyp_final_scorecard_fixture_details").select("id,player_id,game_number,opponent_screen_name,player_role,course1_name,course1_difficulty,course1_player_hw,course1_opponent_hw,course2_name,course2_difficulty,course2_player_hw,course2_opponent_hw,player_total_hw,opponent_total_hw,outcome").eq("scorecard_id", card.data.id).order("game_number") : Promise.resolve({ data: [], error: null }),
      ])
      const childError = slots.error || standings.error || entries.error || details.error
      if (childError) return json({ error: childError.message }, 503)
      return json({ season: season.data, roster: roster.data, card: card.data, slots: slots.data || [], standings: standings.data || [], entries: entries.data || [], details: details.data || [] })
    }

    if (resource === "transition") {
      if (!scorecardId) return json({ error: "scorecardId is required." }, 400)
      const scorecard = await supabase.from("pyp_final_scorecards").select("id, season_id, status").eq("id", scorecardId).maybeSingle()
      if (scorecard.error) return json({ error: scorecard.error.message }, 503)
      if (!scorecard.data || scorecard.data.status !== "approved") return json({ error: "An approved Final Scorecard is required." }, 404)
      const sourceSeason = await supabase.from("seasons").select("season_number").eq("id", scorecard.data.season_id).maybeSingle()
      if (sourceSeason.error || !sourceSeason.data) return json({ error: sourceSeason.error?.message || "Source season not found." }, sourceSeason.error ? 503 : 404)
      const [entries, decisions, candidateSeasons, players] = await Promise.all([
        supabase.from("pyp_final_scorecard_entries").select("player_id, player_screen_name, division_number, division_rank, completed_game_count").eq("scorecard_id", scorecardId).order("division_number").order("division_rank"),
        supabase.from("pyp_final_scorecard_player_decisions").select("player_id, decision").eq("final_scorecard_id", scorecardId),
        supabase.from("seasons").select("id, season_number, start_date, end_date").eq("league_type", "pyp").is("division", null).eq("season_number", sourceSeason.data.season_number + 1),
        supabase.from("players").select("id, screen_name").eq("active", true).order("screen_name"),
      ])
      const initialError = entries.error || decisions.error || candidateSeasons.error || players.error
      if (initialError) return json({ error: initialError.message }, 503)
      const rosters = candidateSeasons.data?.length
        ? await supabase.from("pyp_roster_versions").select("id, season_id, division_count, source_final_scorecard_id").in("season_id", candidateSeasons.data.map((season) => season.id)).in("status", ["draft", "approved"])
        : { data: [], error: null }
      if (rosters.error) return json({ error: rosters.error.message }, 503)
      const targetRosterIds = (rosters.data || []).filter((roster) => roster.source_final_scorecard_id === scorecardId).map((roster) => roster.id)
      const slots = targetRosterIds.length
        ? await supabase.from("pyp_division_roster_slots").select("division_number, slot_number, player_id, player_screen_name, roster_version_id").in("roster_version_id", targetRosterIds).order("division_number").order("slot_number")
        : { data: [], error: null }
      if (slots.error) return json({ error: slots.error.message }, 503)
      return json({ scorecard: scorecard.data, sourceSeason: sourceSeason.data, entries: entries.data || [], decisions: decisions.data || [], candidateSeasons: candidateSeasons.data || [], players: players.data || [], rosters: rosters.data || [], slots: slots.data || [] })
    }

    return json({ error: "Unknown PYP admin data resource." }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "PYP admin data could not be loaded." }, 503)
  }
}
