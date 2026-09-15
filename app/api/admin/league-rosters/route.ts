import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { CURRENT_PLAYER_LIST_CONFIG, divisionAllowed, LEAGUE_ROSTER_CONFIG, normalizeLeagueType, normalizeListKey, type CurrentPlayerListKey, type LeagueType } from "@/lib/adminPlayerLists"
import { loadAdminGlobalPlayers } from "@/lib/identity/adminGlobalPlayerLookup"
import { createAdminSupabaseClient } from "@/lib/identity/adminSupabaseClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RosterBody = {
  action?: "add"
  player_id?: string
  league_type?: string
  list_key?: string
  division?: string
}

type CanonicalPlayer = { id: string; screen_name: string }

const json = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
})

function isMissingCurrentListTable(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "42P01" || /current_player_list_entries.*does not exist/i.test(error?.message || "")
}

async function loadCanonicalPlayers(search = "") {
  return (await loadAdminGlobalPlayers(search)) as CanonicalPlayer[]
}

async function loadRoster(supabase: SupabaseClient, leagueType: LeagueType) {
  const result = await supabase
    .from("player_leagues")
    .select("id,player_id,league_type,division,created_at")
    .eq("league_type", leagueType)
    .order("division")
    .order("created_at")
  if (result.error) throw result.error

  const players = new Map((await loadCanonicalPlayers()).map((player) => [player.id, player]))
  const rows = (result.data || []) as Array<{ id: string; player_id: string; league_type: string; division: string | null; created_at: string }>
  const byPlayer = new Map<string, number>()
  for (const row of rows) byPlayer.set(row.player_id, (byPlayer.get(row.player_id) || 0) + 1)

  return {
    entries: rows.map((row) => ({
      ...row,
      screen_name: players.get(row.player_id)?.screen_name || null,
      status: players.has(row.player_id) ? "active" : "historical identity",
      active: players.has(row.player_id),
      conflict: (byPlayer.get(row.player_id) || 0) > 1,
    })),
    conflict_count: [...byPlayer.values()].filter((count) => count > 1).length,
  }
}

async function loadPlayerList(supabase: SupabaseClient, listKey: CurrentPlayerListKey) {
  const result = await supabase
    .from("current_player_list_entries")
    .select("id,list_key,player_id,added_at")
    .eq("list_key", listKey)
    .order("added_at")
  if (result.error) {
    if (isMissingCurrentListTable(result.error)) return { entries: [], migration_required: true }
    throw result.error
  }

  const players = new Map((await loadCanonicalPlayers()).map((player) => [player.id, player]))
  return {
    entries: ((result.data || []) as Array<{ id: string; list_key: string; player_id: string; added_at: string }>).map((row) => ({
      ...row,
      screen_name: players.get(row.player_id)?.screen_name || null,
      status: players.has(row.player_id) ? "active" : "historical identity",
      active: players.has(row.player_id),
    })),
    migration_required: false,
  }
}

async function canonicalPlayer(playerId: string) {
  return (await loadCanonicalPlayers()).find((player) => player.id === playerId) || null
}

async function currentLeagueRows(supabase: SupabaseClient, playerId: string, leagueType: LeagueType) {
  const result = await supabase
    .from("player_leagues")
    .select("id,player_id,league_type,division,created_at")
    .eq("player_id", playerId)
    .eq("league_type", leagueType)
  if (result.error) throw result.error
  return result.data || []
}

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const params = new URL(request.url).searchParams
    if (params.get("mode") === "directory") return json({ players: await loadCanonicalPlayers(params.get("q") || "") })

    const supabase = createAdminSupabaseClient()
    const listKey = normalizeListKey(params.get("list_key"))
    if (listKey) {
      const result = await loadPlayerList(supabase, listKey)
      return json({ list_key: listKey, config: CURRENT_PLAYER_LIST_CONFIG[listKey], ...result })
    }

    const leagueType = normalizeLeagueType(params.get("league_type"))
    if (!leagueType) return json({ error: "A supported league_type or list_key is required." }, 400)
    const result = await loadRoster(supabase, leagueType)
    return json({ league_type: leagueType, config: LEAGUE_ROSTER_CONFIG[leagueType], ...result })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Current roster or player list could not be loaded." }, 503)
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  let body: RosterBody
  try { body = await request.json() as RosterBody } catch { return json({ error: "Invalid JSON body." }, 400) }

  const listKey = normalizeListKey(body.list_key)
  const leagueType = normalizeLeagueType(body.league_type)
  const division = body.division?.trim() || ""
  if (body.action !== "add" || !body.player_id || (!listKey && !leagueType) || (leagueType && !divisionAllowed(leagueType, division))) {
    return json({ error: "A canonical player, supported list or league, and valid division are required." }, 400)
  }

  try {
    const player = await canonicalPlayer(body.player_id)
    if (!player) return json({ error: "Canonical Global Player was not found." }, 404)
    const supabase = createAdminSupabaseClient()

    if (listKey) {
      const existing = await supabase.from("current_player_list_entries").select("id").eq("list_key", listKey).eq("player_id", player.id).maybeSingle()
      if (existing.error) {
        if (isMissingCurrentListTable(existing.error)) return json({ error: "Current player lists require the prepared migration before they can be changed.", migration_required: true }, 503)
        throw existing.error
      }
      if (existing.data) return json({ error: "This player is already on the current list." }, 409)
      const inserted = await supabase.from("current_player_list_entries").insert({ list_key: listKey, player_id: player.id, added_by: authorization.user.id }).select("id,list_key,player_id,added_at").single()
      if (inserted.error) return json({ error: inserted.error.message }, 503)
      return json({ list_entry: inserted.data, history_preserved: true })
    }

    const existingRows = await currentLeagueRows(supabase, player.id, leagueType!)
    if (existingRows.length > 1) return json({ error: "This player has multiple current rows in this league; review the exact conflict before changing it.", conflict_count: existingRows.length }, 409)
    if (existingRows.length === 1) return json({ error: "This player already has an active division in this league. Use Change Division." }, 409)

    const inserted = await supabase.from("player_leagues").insert({ player_id: player.id, league_type: leagueType, division }).select("id,player_id,league_type,division,created_at").single()
    if (inserted.error) return json({ error: inserted.error.message }, 503)
    return json({ roster_entry: inserted.data, history_preserved: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Player could not be added." }, 503)
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  let body: RosterBody
  try { body = await request.json() as RosterBody } catch { return json({ error: "Invalid JSON body." }, 400) }
  const leagueType = normalizeLeagueType(body.league_type)
  const division = body.division?.trim() || ""
  if (!leagueType || !body.player_id || !divisionAllowed(leagueType, division)) return json({ error: "A canonical player, supported league, and valid division are required." }, 400)

  try {
    const supabase = createAdminSupabaseClient()
    const existingRows = await currentLeagueRows(supabase, body.player_id, leagueType)
    if (existingRows.length > 1) return json({ error: "This player has multiple current rows in this league; review the exact conflict before changing it.", conflict_count: existingRows.length }, 409)
    if (existingRows.length === 0) return json({ error: "Current league roster entry was not found." }, 404)
    const result = await supabase.from("player_leagues").update({ division }).eq("id", existingRows[0].id).select("id,player_id,league_type,division,created_at").single()
    if (result.error) return json({ error: result.error.message }, 503)
    return json({ roster_entry: result.data, history_preserved: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Division could not be changed." }, 503)
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  let body: RosterBody
  try { body = await request.json() as RosterBody } catch { return json({ error: "Invalid JSON body." }, 400) }
  const listKey = normalizeListKey(body.list_key)
  const leagueType = normalizeLeagueType(body.league_type)
  if (!body.player_id || (!listKey && !leagueType)) return json({ error: "A supported list or league and player_id are required." }, 400)

  try {
    const supabase = createAdminSupabaseClient()
    if (listKey) {
      const result = await supabase.from("current_player_list_entries").delete().eq("list_key", listKey).eq("player_id", body.player_id).select("id").maybeSingle()
      if (result.error) {
        if (isMissingCurrentListTable(result.error)) return json({ error: "Current player lists require the prepared migration before they can be changed.", migration_required: true }, 503)
        throw result.error
      }
      if (!result.data) return json({ error: "Current player-list entry was not found." }, 404)
      return json({ removed: result.data.id, history_preserved: true })
    }

    const existingRows = await currentLeagueRows(supabase, body.player_id, leagueType!)
    if (existingRows.length > 1) return json({ error: "This player has multiple current rows in this league; review the exact conflict before removing anything.", conflict_count: existingRows.length }, 409)
    if (existingRows.length === 0) return json({ error: "Current league roster entry was not found." }, 404)
    const result = await supabase.from("player_leagues").delete().eq("id", existingRows[0].id).select("id").single()
    if (result.error) return json({ error: result.error.message }, 503)
    return json({ removed: result.data.id, history_preserved: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Current roster or list entry could not be removed." }, 503)
  }
}
