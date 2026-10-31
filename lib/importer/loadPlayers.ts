import type { SupabaseClient } from "@supabase/supabase-js"

export type PlayerRecord = {
  id: string
  screen_name: string
  discord_name: string | null
  discord_username: string | null
  discord_id: string | null
  active: boolean
}

export async function loadPlayers(options: { includeInactive?: boolean } = {}): Promise<PlayerRecord[]> {
  const response = await fetch("/api/admin/players", {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  })
  const payload = await response.json().catch(() => null) as { players?: PlayerRecord[]; error?: string } | null
  if (!response.ok) throw new Error(payload?.error || "Global Players could not be loaded.")
  const players = payload?.players || []
  return options.includeInactive ? players : players.filter((player) => player.active)
}

export async function loadPlayersWithClient(client: SupabaseClient, options: { includeInactive?: boolean } = {}): Promise<PlayerRecord[]> {
  let query = client
    .from("players")
    .select(`
      id,
      screen_name,
      discord_name,
      discord_username,
      discord_id,
      active
    `)
    .order("screen_name")

  if (!options.includeInactive) query = query.eq("active", true)
  const { data, error } = await query

  if (error) {
    throw error
  }

  return (data ?? []) as PlayerRecord[]
}
