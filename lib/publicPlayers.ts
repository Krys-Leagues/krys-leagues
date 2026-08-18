import { supabase } from "@/lib/supabase"

export type CanonicalPublicPlayer = {
  id: string
  screen_name: string
  status: string | null
  active: boolean | null
  avatar_path: string | null
  identity_player_ids: string[]
}

type CanonicalIdentity = {
  canonical_player_id: string
  identity_player_ids: string[] | null
}

export async function loadCanonicalPublicPlayers(): Promise<{
  data: CanonicalPublicPlayer[]
  error: Error | null
}> {
  const playersResponse = await supabase
    .from("players")
    .select("id, screen_name, status, active, avatar_path")
    .eq("active", true)
    .order("screen_name", { ascending: true })

  if (playersResponse.error) {
    return { data: [], error: new Error(playersResponse.error.message) }
  }

  const activePlayers = (playersResponse.data || []).filter((player) => {
    const status = player.status?.trim().toLowerCase()
    return status !== "merged" && status !== "retired" && status !== "archived"
  })

  const identityResponses = await Promise.all(
    activePlayers.map((player) =>
      supabase.rpc("get_public_player_canonical_identity", {
        p_player_id: player.id,
      })
    )
  )

  const canonicalPlayers = new Map<string, CanonicalPublicPlayer>()

  for (let index = 0; index < activePlayers.length; index += 1) {
    const player = activePlayers[index]
    const identityResponse = identityResponses[index]

    if (identityResponse.error) {
      return { data: [], error: new Error(identityResponse.error.message) }
    }

    const identity = (Array.isArray(identityResponse.data)
      ? identityResponse.data[0]
      : identityResponse.data) as CanonicalIdentity | null

    if (!identity || identity.canonical_player_id !== player.id) continue

    canonicalPlayers.set(player.id, {
      ...player,
      identity_player_ids:
        identity.identity_player_ids && identity.identity_player_ids.length > 0
          ? identity.identity_player_ids
          : [player.id],
    })
  }

  return { data: Array.from(canonicalPlayers.values()), error: null }
}
