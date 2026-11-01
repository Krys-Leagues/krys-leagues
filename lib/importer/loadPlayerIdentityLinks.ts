import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export type PlayerIdentityLink = {
  historicalPlayerId: string
  canonicalPlayerId: string
}

export async function loadPlayerIdentityLinks(): Promise<PlayerIdentityLink[]> {
  const { data, error } = await supabase
    .from("player_identity_links")
    .select("historical_player_id, canonical_player_id")

  if (error) throw error

  return (data ?? []).map((row) => ({
    historicalPlayerId: row.historical_player_id,
    canonicalPlayerId: row.canonical_player_id,
  }))
}
