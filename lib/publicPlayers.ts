import { supabase } from "@/lib/supabase"
import {
  buildCanonicalPublicPlayerChoices,
  type CanonicalIdentity,
  type CanonicalPublicPlayer,
  type PublicPlayerRow,
} from "@/lib/publicPlayerChoices"

export type { CanonicalPublicPlayer } from "@/lib/publicPlayerChoices"

export async function loadCanonicalPublicPlayers(): Promise<{
  data: CanonicalPublicPlayer[]
  error: Error | null
}> {
  const playersResponse = await supabase
    .from("players")
    .select("id, screen_name, status, active, avatar_path, is_server_booster, has_krys_server_tag, profile_badges")
    .eq("active", true)
    .order("screen_name", { ascending: true })

  if (playersResponse.error) {
    return { data: [], error: new Error(playersResponse.error.message) }
  }

  const activePlayers = (playersResponse.data || []) as PublicPlayerRow[]

  const identityResponses = await Promise.all(
    activePlayers.map((player) =>
      supabase.rpc("get_public_player_canonical_identity", {
        p_player_id: player.id,
      })
    )
  )

  const identities: Array<CanonicalIdentity | null> = []

  for (let index = 0; index < activePlayers.length; index += 1) {
    const identityResponse = identityResponses[index]

    if (identityResponse.error) {
      return { data: [], error: new Error(identityResponse.error.message) }
    }

    identities.push((Array.isArray(identityResponse.data)
      ? identityResponse.data[0]
      : identityResponse.data) as CanonicalIdentity | null)
  }

  return { data: buildCanonicalPublicPlayerChoices(activePlayers, identities), error: null }
}
