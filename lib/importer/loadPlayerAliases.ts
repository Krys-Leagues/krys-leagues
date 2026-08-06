import { createClient } from "@supabase/supabase-js"
import type { PlayerIdentityAlias } from "@/lib/identity"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type AliasDatabaseRow = {
  id: string
  player_id: string
  alias_name: string
  normalized_alias: string | null
  source: string | null
  first_seen_league: string | null
  first_seen_season: number | null
  last_seen_league: string | null
  last_seen_season: number | null
  active: boolean | null
}

export async function loadPlayerAliases(): Promise<
  PlayerIdentityAlias[]
> {
  const { data, error } = await supabase
    .from("player_aliases")
    .select(`
      id,
      player_id,
      alias_name,
      normalized_alias,
      source,
      first_seen_league,
      first_seen_season,
      last_seen_league,
      last_seen_season,
      active
    `)
    .order("alias_name")

  if (error) {
    throw error
  }

  return ((data ?? []) as AliasDatabaseRow[]).map(
    (row) => ({
      id: row.id,
      playerId: row.player_id,
      aliasName: row.alias_name,
      normalizedAlias:
        row.normalized_alias ?? "",
      source:
        row.source === "manual" ||
        row.source === "import" ||
        row.source === "discord_name" ||
        row.source === "screen_name" ||
        row.source === "historical_alias"
          ? row.source
          : "unknown",
      firstSeenLeague:
        row.first_seen_league,
      firstSeenSeason:
        row.first_seen_season,
      lastSeenLeague:
        row.last_seen_league,
      lastSeenSeason:
        row.last_seen_season,
      active: row.active !== false,
    })
  )
}