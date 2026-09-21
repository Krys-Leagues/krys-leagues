import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createAdminServiceClient } from "@/lib/admin/adminServiceClient"

export const runtime = "nodejs"

const CONTRACT = {
  stroke: { roster: "stroke_roster_versions", slots: "stroke_division_roster_slots" },
  match: { roster: "match_roster_versions", slots: "match_division_roster_slots" },
  pyp: { roster: "pyp_roster_versions", slots: "pyp_division_roster_slots" },
} as const

function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }) }

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    const params = new URL(request.url).searchParams
    const seasonId = String(params.get("seasonId") || "").trim()
    const leagueKey = String(params.get("leagueKey") || "").trim() as keyof typeof CONTRACT
    const contract = CONTRACT[leagueKey]
    if (!seasonId || !contract) return json({ error: "A valid managed league season is required." }, 400)
    const client = createAdminServiceClient()
    const season = await client.from("seasons").select("id, season_number, league_type").eq("id", seasonId).maybeSingle()
    if (season.error) throw season.error
    if (!season.data || season.data.league_type?.trim().toLowerCase() !== leagueKey) return json({ error: "The requested managed season was not found." }, 404)
    const rosterResult = await client.from(contract.roster).select("id, division_count, status").eq("season_id", seasonId).in("status", ["draft", "approved", "locked"]).order("created_at", { ascending: false })
    if (rosterResult.error) throw rosterResult.error
    const roster = (rosterResult.data || []).find((row) => row.status === "draft") || (rosterResult.data || []).find((row) => row.status === "approved") || (rosterResult.data || []).find((row) => row.status === "locked")
    if (!roster) return json({ season: season.data, roster: null, slots: [], playerStates: {} })
    const slotsResult = await client.from(contract.slots).select("player_id, player_screen_name, division_number, slot_number").eq("roster_version_id", roster.id).not("player_id", "is", null).order("division_number").order("slot_number")
    if (slotsResult.error) throw slotsResult.error
    const ids = Array.from(new Set((slotsResult.data || []).map((slot) => slot.player_id).filter(Boolean)))
    const players = ids.length ? await client.from("players").select("id, active").in("id", ids) : { data: [], error: null }
    if (players.error) throw players.error
    return json({ season: season.data, roster, slots: slotsResult.data || [], playerStates: Object.fromEntries((players.data || []).map((player) => [player.id, player.active])) })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Managed roster players could not be loaded." }, 503)
  }
}
