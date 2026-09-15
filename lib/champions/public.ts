import "server-only"

import { createClient } from "@supabase/supabase-js"
import {
  buildCanonicalPlayerDisplays,
  historicalPlayerName,
  type CanonicalCurrentPlayerRow,
  type CanonicalIdentityResolution,
} from "@/lib/canonicalPlayerDisplayCore"
import { filterTrophiesForScope, type ChampionScope } from "@/lib/championScope"

type TrophyRow = {
  id: string
  player_id: string | null
  player_name: string | null
  trophy_title: string | null
  league_type: string | null
  placement: string | null
  event_name: string | null
  division: string | null
  season: string | null
  week: string | null
  image_url: string | null
}

export type PublicChampionTrophy = Omit<TrophyRow, "player_name"> & {
  playerName: string
}

function createPublicChampionsReader() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Hall of Champions server access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function loadPublicChampionTrophies(scope: ChampionScope): Promise<PublicChampionTrophy[]> {
  const reader = createPublicChampionsReader()
  let trophiesRequest = reader
    .from("player_trophies")
    .select("id,player_id,player_name,trophy_title,placement,event_name,league_type,division,season,week,image_url")
    .order("season", { ascending: false })
  if (scope === "kwt") trophiesRequest = trophiesRequest.eq("league_type", "kwt")

  const trophiesResponse = await trophiesRequest
  if (trophiesResponse.error) throw trophiesResponse.error
  const trophies = filterTrophiesForScope((trophiesResponse.data || []) as TrophyRow[], scope)
  const sourcePlayerIds = Array.from(
    new Set(trophies.map((trophy) => trophy.player_id).filter((id): id is string => Boolean(id))),
  )

  const identityResponses = await Promise.all(
    sourcePlayerIds.map((sourcePlayerId) =>
      reader.rpc("get_public_player_canonical_identity", { p_player_id: sourcePlayerId }),
    ),
  )
  const resolutions: CanonicalIdentityResolution[] = []

  for (let index = 0; index < sourcePlayerIds.length; index += 1) {
    const response = identityResponses[index]
    if (response.error) throw response.error
    const identity = Array.isArray(response.data) ? response.data[0] : response.data
    resolutions.push({
      source_player_id: sourcePlayerIds[index],
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
    ? await reader.from("players").select("id,screen_name,status,active").in("id", canonicalIds)
    : { data: [], error: null }
  if (playersResponse.error) throw playersResponse.error

  const displays = buildCanonicalPlayerDisplays(
    sourcePlayerIds,
    resolutions,
    (playersResponse.data || []) as CanonicalCurrentPlayerRow[],
  )
  const displayBySource = new Map(displays.map((display) => [display.source_player_id, display]))

  return trophies.map(({ player_name: historicalName, ...trophy }) => ({
    ...trophy,
    playerName: historicalPlayerName(
      trophy.player_id ? displayBySource.get(trophy.player_id) : undefined,
      historicalName,
    ),
  }))
}
