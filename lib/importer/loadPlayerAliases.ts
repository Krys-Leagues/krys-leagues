import { createClient } from "@supabase/supabase-js"
import type { PlayerIdentityAlias } from "@/lib/identity"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type AliasDatabaseRow = {
  id: string
  player_id: string
  alias: string
  normalized_alias: string
  source: string | null
  verified: boolean
}

export async function loadPlayerAliases(): Promise<
  PlayerIdentityAlias[]
> {
  const { data, error } = await supabase
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

  return ((data ?? []) as AliasDatabaseRow[]).map(
    (row) => ({
      id: row.id,
      playerId: row.player_id,
      aliasName: row.alias,
      normalizedAlias: row.normalized_alias,
      verified: row.verified,
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
