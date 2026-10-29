import "server-only"

import { createClient } from "@supabase/supabase-js"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

function soloAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Solo admin server access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function requiredParam(request: Request, name: string) {
  return new URL(request.url).searchParams.get(name)?.trim() || null
}

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const resource = new URL(request.url).searchParams.get("resource")
  const seasonId = requiredParam(request, "seasonId")
  const weekNumber = Number(new URL(request.url).searchParams.get("week") || "1") || 1

  try {
    const supabase = soloAdminClient()

    if (resource === "hub") {
      const seasons = await supabase.from("seasons").select("id,season_number,is_active").eq("league_type", "solo").is("division", null).order("season_number", { ascending: false })
      if (seasons.error) return json({ error: seasons.error.message }, 503)
      const ids = (seasons.data || []).map((season) => season.id)
      const rosters = ids.length
        ? await supabase.from("solo_roster_versions").select("season_id,status").in("season_id", ids).in("status", ["draft", "approved", "locked"])
        : { data: [], error: null }
      if (rosters.error) return json({ error: rosters.error.message }, 503)
      return json({ seasons: seasons.data || [], rosters: rosters.data || [] })
    }

    if (resource === "season") {
      if (!seasonId) return json({ error: "seasonId is required." }, 400)
      const season = await supabase.from("seasons").select("season_number,league_type,start_date,end_date").eq("id", seasonId).maybeSingle()
      if (season.error) return json({ error: season.error.message }, 503)
      return json({ season: season.data })
    }

    if (!seasonId) return json({ error: "seasonId is required." }, 400)

    if (resource === "setup") {
      const [seasonResult, rosterResult, poolResult] = await Promise.all([
        supabase.from("seasons").select("season_number,league_type").eq("id", seasonId).maybeSingle(),
        supabase.from("solo_roster_versions").select("id,status").eq("season_id", seasonId).in("status", ["draft", "approved", "locked"]).order("version_number", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("solo_player_pool").select("player_id").eq("season_id", seasonId),
      ])
      if (seasonResult.error || rosterResult.error || poolResult.error) return json({ error: seasonResult.error?.message || rosterResult.error?.message || poolResult.error?.message }, 503)
      if (!seasonResult.data || seasonResult.data.league_type !== "solo" || !rosterResult.data) return json({ error: "Managed Solo season setup was not found." }, 404)
      const poolIds = (poolResult.data || []).map((entry) => entry.player_id)
      const [entries, poolPlayers] = await Promise.all([
        supabase.from("solo_roster_entries").select("player_id,player_screen_name,division,display_order").eq("roster_version_id", rosterResult.data.id).order("display_order"),
        poolIds.length
          ? supabase.from("players").select("id,screen_name,active,status").in("id", poolIds).order("screen_name")
          : Promise.resolve({ data: [], error: null }),
      ])
      if (entries.error || poolPlayers.error) return json({ error: entries.error?.message || poolPlayers.error?.message }, 503)
      return json({ season: seasonResult.data, roster: rosterResult.data, players: poolPlayers.data || [], entries: entries.data || [] })
    }

    if (resource === "weeks") {
      const [seasonResult, weeksResult, rosterResult] = await Promise.all([
        supabase.from("seasons").select("season_number,league_type").eq("id", seasonId).maybeSingle(),
        supabase.from("solo_weeks").select("id,week_number,course_name,course_code,status,due_date").eq("season_id", seasonId).order("week_number"),
        supabase.from("solo_roster_versions").select("id").eq("season_id", seasonId).eq("status", "approved").maybeSingle(),
      ])
      if (seasonResult.error || weeksResult.error || rosterResult.error) return json({ error: seasonResult.error?.message || weeksResult.error?.message || rosterResult.error?.message }, 503)
      const weeks = weeksResult.data || []
      const entries = rosterResult.data
        ? await supabase.from("solo_roster_entries").select("player_id").eq("roster_version_id", rosterResult.data.id)
        : { data: [], error: null }
      if (entries.error) return json({ error: entries.error.message }, 503)
      const missing: Record<string, { easy: number; hard: number; both: number }> = {}
      const players = (entries.data || []).map((entry) => entry.player_id)
      for (const week of weeks) {
        const attempts = await supabase.from("solo_live_best_attempts").select("player_id,difficulty").eq("week_id", week.id)
        const easy = new Set((attempts.data || []).filter((attempt) => attempt.difficulty === "easy").map((attempt) => attempt.player_id))
        const hard = new Set((attempts.data || []).filter((attempt) => attempt.difficulty === "hard").map((attempt) => attempt.player_id))
        missing[week.id] = { easy: players.filter((player) => !easy.has(player)).length, hard: players.filter((player) => !hard.has(player)).length, both: players.filter((player) => !easy.has(player) && !hard.has(player)).length }
      }
      return json({ season: seasonResult.data, weeks, missing })
    }

    if (resource === "standings") {
      const [seasonResult, weeksResult, rosterResult, snapshotsResult] = await Promise.all([
        supabase.from("seasons").select("season_number,league_type").eq("id", seasonId).maybeSingle(),
        supabase.from("solo_weeks").select("id,week_number,status,course_code").eq("season_id", seasonId).order("week_number"),
        supabase.from("solo_roster_versions").select("id").eq("season_id", seasonId).eq("status", "approved").maybeSingle(),
        supabase.from("solo_week_snapshots").select("id").eq("season_id", seasonId).eq("is_current", true),
      ])
      if (seasonResult.error || weeksResult.error || rosterResult.error || snapshotsResult.error) return json({ error: seasonResult.error?.message || weeksResult.error?.message || rosterResult.error?.message || snapshotsResult.error?.message }, 503)
      const snapshotIds = (snapshotsResult.data || []).map((snapshot) => snapshot.id)
      const [entries, frozen] = await Promise.all([
        rosterResult.data
          ? supabase.from("solo_roster_entries").select("player_id,player_screen_name,division,display_order").eq("roster_version_id", rosterResult.data.id).order("display_order")
          : Promise.resolve({ data: [], error: null }),
        snapshotIds.length
          ? supabase.from("solo_week_snapshot_entries").select("week_id,player_id,easy_stroke_score,hard_stroke_score").in("snapshot_id", snapshotIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (entries.error || frozen.error) return json({ error: entries.error?.message || frozen.error?.message }, 503)
      return json({ seasonNumber: seasonResult.data?.season_number ?? null, weeks: weeksResult.data || [], entries: entries.data || [], frozen: frozen.data || [] })
    }

    if (resource === "results") {
      const [seasonResult, weeksResult, rosterResult] = await Promise.all([
        supabase.from("seasons").select("season_number,league_type").eq("id", seasonId).maybeSingle(),
        supabase.from("solo_weeks").select("id,week_number,course_name,course_code,status").eq("season_id", seasonId).order("week_number"),
        supabase.from("solo_roster_versions").select("id").eq("season_id", seasonId).eq("status", "approved").maybeSingle(),
      ])
      if (seasonResult.error || weeksResult.error || rosterResult.error) return json({ error: seasonResult.error?.message || weeksResult.error?.message || rosterResult.error?.message }, 503)
      const weeks = weeksResult.data || []
      const week = weeks.find((candidate) => candidate.week_number === weekNumber) || weeks[0]
      if (!seasonResult.data || seasonResult.data.league_type !== "solo" || !rosterResult.data || weeks.length !== 4 || !week) return json({ error: "Exact managed Solo season is required." }, 404)
      const [entries, attempts] = await Promise.all([
        supabase.from("solo_roster_entries").select("player_id,player_screen_name,division,display_order").eq("roster_version_id", rosterResult.data.id).order("display_order"),
        supabase.from("solo_score_attempts").select("id,player_id,difficulty,stroke_score,hn1_count,entered_at").eq("week_id", week.id).order("entered_at", { ascending: false }),
      ])
      if (entries.error || attempts.error) return json({ error: entries.error?.message || attempts.error?.message }, 503)
      return json({ seasonNumber: seasonResult.data.season_number, weeks, entries: entries.data || [], attempts: attempts.data || [] })
    }

    return json({ error: "Unknown Solo admin data resource." }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Solo admin data could not be loaded." }, 503)
  }
}
