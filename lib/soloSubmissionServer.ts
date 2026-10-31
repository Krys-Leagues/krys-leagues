import "server-only"

import type { SupabaseClient, User } from "@supabase/supabase-js"
import { resolveCanonicalSessionPlayer } from "@/lib/scorecards/server"
import { selectLiveSoloWeek } from "@/lib/soloWeekState"

export async function resolveSoloPlayer(client: SupabaseClient, user: User) {
  const identity = await resolveCanonicalSessionPlayer(client, user)
  if (identity.status !== "resolved") return identity
  const season = await client.from("seasons").select("id,season_number").eq("league_type", "solo").eq("is_active", true).order("season_number", { ascending: false }).limit(1).maybeSingle()
  if (season.error || !season.data) return { status: "no_active_season" as const }
  const roster = await client.from("solo_roster_entries").select("player_id,player_screen_name,division,display_order,solo_roster_versions!inner(status)").eq("season_id", season.data.id).eq("player_id", identity.playerId).in("solo_roster_versions.status", ["approved", "locked"]).maybeSingle()
  if (roster.error || !roster.data) return { status: "not_rostered" as const }
  const weeks = await client.from("solo_weeks").select("id,week_number,course_name,course_code,status,due_date").eq("season_id", season.data.id).eq("status", "open").order("week_number")
  if (weeks.error || !weeks.data?.length) return { status: "no_open_week" as const }
  const current = selectLiveSoloWeek(weeks.data, new Date().toISOString().slice(0, 10))
  if (!current) return { status: "no_open_week" as const }
  return { status: "resolved" as const, playerId: identity.playerId, season: season.data, roster: roster.data, week: current }
}
