import { supabase } from "@/lib/supabase"

export type CurrentPlayerResolution = {
  status: "signed_out" | "matched" | "no_match" | "conflict" | "error"
  playerId: string | null
  message?: string
}

export async function resolveCurrentPlayer(): Promise<CurrentPlayerResolution> {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) return { status: "error", playerId: null, message: authError.message }
  if (!authData.user) return { status: "signed_out", playerId: null }

  const { data, error } = await supabase.rpc("resolve_current_discord_player_login")
  if (error) return { status: "error", playerId: null, message: error.message }

  const row = (Array.isArray(data) ? data[0] : data) as {
    resolution_status?: "matched" | "no_match" | "conflict"
    canonical_player_id?: string | null
  } | null

  if (row?.resolution_status === "matched" && row.canonical_player_id) {
    return { status: "matched", playerId: row.canonical_player_id }
  }
  return { status: row?.resolution_status || "no_match", playerId: null }
}
