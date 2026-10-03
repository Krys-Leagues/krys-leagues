import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export function createDoublesRuntimeClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Doubles runtime access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function authorizeDoublesParticipant(fixtureId: string) {
  const sessionClient = await createServerSupabaseClient()
  const user = await sessionClient.auth.getUser()
  if (user.error || !user.data.user) return { authorized: false as const, status: 401, message: "Authentication required." }

  const resolution = await sessionClient.rpc("resolve_current_discord_player_login")
  if (resolution.error || resolution.data?.[0]?.resolution_status !== "matched" || !resolution.data?.[0]?.canonical_player_id) {
    return { authorized: false as const, status: 403, message: "Canonical player identity could not be resolved." }
  }

  const client = createDoublesRuntimeClient()
  const fixtureResult = await client.from("doubles_managed_fixtures").select("id,season_id,division,game_number,home_season_team_id,away_season_team_id,home_team_name_snapshot,away_team_name_snapshot,home_course,away_course,due_at,arranged_at,status").eq("id", fixtureId).maybeSingle()
  if (fixtureResult.error || !fixtureResult.data) return { authorized: false as const, status: 404, message: "Doubles fixture not found." }

  const members = await client.from("doubles_season_team_members").select("season_team_id,player_id").in("season_team_id", [fixtureResult.data.home_season_team_id, fixtureResult.data.away_season_team_id]).eq("season_id", fixtureResult.data.season_id).in("role", ["MEMBER", "member"]).eq("active", true).is("effective_to", null)
  if (members.error) return { authorized: false as const, status: 500, message: "Doubles participants could not be loaded." }
  const participantIds = [...new Set((members.data ?? []).map((member) => member.player_id as string))]
  if (participantIds.length !== 4 || !participantIds.includes(resolution.data[0].canonical_player_id as string)) return { authorized: false as const, status: 403, message: "Only the four scheduled Doubles players may access this fixture." }

  return { authorized: true as const, client, fixture: fixtureResult.data, participantId: resolution.data[0].canonical_player_id as string, participantIds }
}
