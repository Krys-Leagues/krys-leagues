import "server-only"

import { createClient } from "@supabase/supabase-js"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Match final-scorecard server access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const params = new URL(request.url).searchParams
  const scorecardId = params.get("scorecardId")?.trim()
  const seasonId = params.get("seasonId")?.trim()
  if (!scorecardId && !seasonId) return json({ error: "scorecardId or seasonId is required." }, 400)

  try {
    const supabase = adminClient()
    if (scorecardId) {
      const scorecardResult = await supabase
        .from("match_final_scorecards")
        .select("id, season_id, status")
        .eq("id", scorecardId)
        .maybeSingle()
      if (scorecardResult.error) return json({ error: scorecardResult.error.message }, 503)
      if (!scorecardResult.data || scorecardResult.data.status !== "approved") {
        return json({ error: "An approved Final Scorecard is required." }, 404)
      }
      const [entries, decisions] = await Promise.all([
        supabase.from("match_final_scorecard_entries")
          .select("player_id, player_screen_name, division_number, division_rank, completed_game_count")
          .eq("scorecard_id", scorecardId).order("division_number").order("division_rank"),
        supabase.from("match_final_scorecard_player_decisions")
          .select("player_id, decision").eq("final_scorecard_id", scorecardId),
      ])
      if (entries.error || decisions.error) return json({ error: entries.error?.message || decisions.error?.message }, 503)
      return json({ data: { scorecard: scorecardResult.data, entries: entries.data || [], decisions: decisions.data || [] } })
    }

    const scorecards = await supabase
      .from("match_final_scorecards")
      .select("id, season_id, source_roster_version_id, status, approved_at, approval_note")
      .eq("season_id", seasonId)
      .in("status", ["draft", "approved"])
    if (scorecards.error) return json({ error: scorecards.error.message }, 503)
    const selected = (scorecards.data || []).find((item) => item.status === "approved")
      || (scorecards.data || []).find((item) => item.status === "draft")
      || null
    if (!selected) return json({ data: { scorecard: null, entries: [], completedFixtures: 0, totalFixtures: 0 } })

    const [entries, fixtures] = await Promise.all([
      supabase.from("match_final_scorecard_entries")
        .select("id, division_number, division_rank, player_id, player_screen_name, completed_game_count, wins, losses, ties, points, holes_won, game1_course, game1_outcome, game1_hw, game2_course, game2_outcome, game2_hw, game3_course, game3_outcome, game3_hw")
        .eq("scorecard_id", selected.id).order("division_number").order("division_rank"),
      supabase.from("schedule").select("id").eq("league_type", "match").eq("season_id", seasonId)
        .eq("match_roster_version_id", selected.source_roster_version_id),
    ])
    if (entries.error || fixtures.error) return json({ error: entries.error?.message || fixtures.error?.message }, 503)

    const fixtureIds = (fixtures.data || []).map((fixture) => fixture.id)
    let completedFixtures = 0
    if (fixtureIds.length > 0) {
      const results = await supabase.from("results").select("schedule_id, player1_hw, player2_hw")
        .eq("league_type", "match").in("schedule_id", fixtureIds)
      if (results.error) return json({ error: results.error.message }, 503)
      completedFixtures = (results.data || []).filter((result) => result.player1_hw !== null && result.player2_hw !== null).length
    }
    return json({ data: { scorecard: selected, entries: entries.data || [], completedFixtures, totalFixtures: fixtureIds.length } })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Match final scorecard could not be loaded." }, 503)
  }
}
