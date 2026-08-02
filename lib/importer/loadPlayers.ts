import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export type PlayerRecord = {
  id: string
  screen_name: string
  discord_name: string | null
  discord_id: string | null
  active: boolean
}

export async function loadPlayers(): Promise<PlayerRecord[]> {
  const { data, error } = await supabase
    .from("players")
    .select(`
      id,
      screen_name,
      discord_name,
      discord_id,
      active
    `)
    .order("screen_name")

  if (error) {
    throw error
  }

  return (data ?? []) as PlayerRecord[]
}