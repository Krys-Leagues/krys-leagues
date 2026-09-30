import type { SupabaseClient } from "@supabase/supabase-js"

export type PlayerIdentityLink = {
  historicalPlayerId: string
  canonicalPlayerId: string
}

export async function loadPlayerIdentityLinks(): Promise<PlayerIdentityLink[]> {
  const response = await fetch("/api/admin/players", {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  })
  const payload = await response.json().catch(() => null) as {
    identityLinks?: Array<{ historical_player_id: string; canonical_player_id: string }>
    error?: string
  } | null
  if (!response.ok) throw new Error(payload?.error || "Player identity links could not be loaded.")
  return (payload?.identityLinks || []).map((row) => ({
    historicalPlayerId: row.historical_player_id,
    canonicalPlayerId: row.canonical_player_id,
  }))
}

export async function loadPlayerIdentityLinksWithClient(client: SupabaseClient): Promise<PlayerIdentityLink[]> {
  const { data, error } = await client
    .from("player_identity_links")
    .select("historical_player_id, canonical_player_id")

  if (error) throw error

  return (data ?? []).map((row) => ({
    historicalPlayerId: row.historical_player_id,
    canonicalPlayerId: row.canonical_player_id,
  }))
}
