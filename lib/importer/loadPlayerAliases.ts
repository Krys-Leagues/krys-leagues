import type { SupabaseClient } from "@supabase/supabase-js"
import type { PlayerIdentityAlias } from "@/lib/identity"

type AliasDatabaseRow = {
  id: string
  player_id: string
  alias: string
  normalized_alias: string
  source: string | null
  verified: boolean
}

function mapAliasRows(rows: AliasDatabaseRow[]): PlayerIdentityAlias[] {
  return rows.map(
    (row) => ({
      id: row.id,
      playerId: row.player_id,
      aliasName: row.alias,
      normalizedAlias: row.normalized_alias,
      source:
        row.source === "manual" ||
        row.source === "import" ||
        row.source === "discord_name" ||
        row.source === "screen_name" ||
        row.source === "historical_alias"
          ? row.source
          : "unknown",
      firstSeenLeague: null,
      firstSeenSeason: null,
      lastSeenLeague: null,
      lastSeenSeason: null,
      active: true,
      verified: row.verified,
    })
  )
}

export async function loadPlayerAliases(): Promise<PlayerIdentityAlias[]> {
  const response = await fetch("/api/admin/players", {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  })
  const payload = await response.json().catch(() => null) as { aliases?: AliasDatabaseRow[]; error?: string } | null
  if (!response.ok) throw new Error(payload?.error || "Verified player aliases could not be loaded.")
  return mapAliasRows(payload?.aliases || [])
}

export async function loadPlayerAliasesWithClient(client: SupabaseClient): Promise<PlayerIdentityAlias[]> {
  const { data, error } = await client
    .from("player_aliases")
    .select(`
      id,
      player_id,
      alias,
      normalized_alias,
      source,
      verified
    `)
    .order("alias")

  if (error) {
    throw error
  }

  return mapAliasRows((data ?? []) as AliasDatabaseRow[])
}
