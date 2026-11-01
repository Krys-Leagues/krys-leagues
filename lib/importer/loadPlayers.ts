import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export type PlayerRecord = {
  id: string
  screen_name: string
  discord_name: string | null
  discord_username: string | null
  discord_id: string | null
  active: boolean
}

export async function loadPlayers(options: { includeInactive?: boolean } = {}): Promise<PlayerRecord[]> {
  let query = supabase
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
