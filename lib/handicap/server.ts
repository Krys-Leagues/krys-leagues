import "server-only"

import { createClient } from "@supabase/supabase-js"
import { loadAdminGlobalPlayerDirectory } from "@/lib/identity/adminGlobalPlayerLookup"

export function createHandicapDataClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Handicap server access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export type HandicapDisplayRow = {
  playerId: string
  playerName: string
  handicapIndex: number | null
  roundsCount: number
  updatedAt: string | null
  status: "NO_INDEX" | "PROVISIONAL" | "ACTIVE"
}

export async function loadHandicapRows() {
  const client = createHandicapDataClient()
  const [indexResult, players] = await Promise.all([
    client.from("handicap_index").select("player_id,player_name,handicap_index,rounds_count,updated_at").order("handicap_index", { ascending: true, nullsFirst: false }),
    loadAdminGlobalPlayerDirectory(),
  ])
  if (indexResult.error) throw indexResult.error
  const linksResult = await client.from("player_identity_links").select("historical_player_id,canonical_player_id")
  if (linksResult.error) throw linksResult.error
  const links = new Map((linksResult.data ?? []).map((link) => [link.historical_player_id as string, link.canonical_player_id as string]))
  const names = new Map(players.map((player) => [player.id, player.screenName]))
  const normalizedNames = new Map<string, string>()
  const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
  for (const player of players) {
    normalizedNames.set(normalize(player.screenName), player.screenName)
    for (const alias of player.verifiedAliases) normalizedNames.set(normalize(alias), player.screenName)
  }
  function canonicalId(playerId: string) {
    const visited = new Set<string>()
    let current = playerId
    while (links.has(current) && !visited.has(current)) {
      visited.add(current)
      current = links.get(current)!
    }
    return current
  }
  return (indexResult.data ?? []).map((row) => {
    const roundsCount = Number(row.rounds_count) || 0
    return {
      playerId: row.player_id as string,
      playerName: names.get(canonicalId(row.player_id as string)) || normalizedNames.get(normalize((row.player_name as string | null) || "")) || "Identity pending",
      handicapIndex: row.handicap_index == null ? null : Number(row.handicap_index),
      roundsCount,
      updatedAt: (row.updated_at as string | null) ?? null,
      status: roundsCount >= 20 ? "ACTIVE" : roundsCount >= 3 ? "PROVISIONAL" : "NO_INDEX",
    } satisfies HandicapDisplayRow
  })
}

export async function loadHandicapRatings() {
  const client = createHandicapDataClient()
  const result = await client.from("handicap_course_ratings").select("course_key,course_name,difficulty,course_rating,slope_rating,source,verified_at").order("course_name")
  if (result.error) {
    return { migrationRequired: result.error.code === "42P01", ratings: [] as Array<Record<string, unknown>> }
  }
  return { migrationRequired: false, ratings: result.data ?? [] }
}
