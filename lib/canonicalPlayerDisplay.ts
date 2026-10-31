import { supabase } from "@/lib/supabase"
import {
  buildCanonicalPlayerDisplays,
  type CanonicalCurrentPlayerRow,
  type CanonicalIdentityResolution,
  type CanonicalPlayerDisplay,
} from "@/lib/canonicalPlayerDisplayCore"

export * from "@/lib/canonicalPlayerDisplayCore"

export async function loadCanonicalPlayerDisplays(sourcePlayerIds: string[]): Promise<{
  data: CanonicalPlayerDisplay[]
  error: Error | null
}> {
  const uniqueSourceIds = Array.from(new Set(sourcePlayerIds.filter(Boolean)))
  if (uniqueSourceIds.length === 0) return { data: [], error: null }

  const identityResponses = await Promise.all(
    uniqueSourceIds.map((sourcePlayerId) =>
      supabase.rpc("get_public_player_canonical_identity", { p_player_id: sourcePlayerId }),
    ),
  )
  const resolutions: CanonicalIdentityResolution[] = []

  for (let index = 0; index < uniqueSourceIds.length; index += 1) {
    const response = identityResponses[index]
    if (response.error) return { data: [], error: new Error(response.error.message) }
    const identity = Array.isArray(response.data) ? response.data[0] : response.data
    resolutions.push({
      source_player_id: uniqueSourceIds[index],
      canonical_player_id:
        identity && typeof identity.canonical_player_id === "string"
          ? identity.canonical_player_id
          : null,
    })
  }

  const canonicalIds = Array.from(
    new Set(resolutions.map((resolution) => resolution.canonical_player_id).filter(Boolean)),
  ) as string[]
  const playersResponse = canonicalIds.length > 0
    ? await supabase
        .from("players")
        .select("id, screen_name, status, active")
        .in("id", canonicalIds)
    : { data: [], error: null }

  if (playersResponse.error) return { data: [], error: new Error(playersResponse.error.message) }

  return {
    data: buildCanonicalPlayerDisplays(
      uniqueSourceIds,
      resolutions,
      (playersResponse.data || []) as CanonicalCurrentPlayerRow[],
    ),
    error: null,
  }
}
