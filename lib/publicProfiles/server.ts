import "server-only"

import { createClient } from "@supabase/supabase-js"
import { buildCanonicalPublicPlayerChoices, type CanonicalIdentity, type PublicPlayerRow } from "@/lib/publicPlayerChoices"

export type PublicProfileSearchPlayer = {
  id: string
  screen_name: string
  avatar_path: string | null
}

function createPublicProfileReader() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Public profile search is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function safeSearch(value: string | null) {
  return (value || "").trim().slice(0, 80)
}

export async function loadPublicProfileSearch(search: string | null) {
  const reader = createPublicProfileReader()
  const query = safeSearch(search)
  let request = reader
    .from("players")
    .select("id,screen_name,status,active,avatar_path")
    .eq("active", true)
    .order("screen_name", { ascending: true })
    .limit(query ? 100 : 250)
  if (query) request = request.ilike("screen_name", `%${query.replace(/[%_]/g, "\\$&")}%`)
  const playersResponse = await request
  if (playersResponse.error) throw playersResponse.error
  const activePlayers = (playersResponse.data || []).map((player) => ({
    ...player,
    is_server_booster: false,
    has_krys_server_tag: false,
    profile_badges: [],
  })) as PublicPlayerRow[]
  const identities = await Promise.all(activePlayers.map(async (player) => {
    const identityResponse = await reader.rpc("get_public_player_canonical_identity", { p_player_id: player.id })
    if (identityResponse.error) throw identityResponse.error
    return (Array.isArray(identityResponse.data) ? identityResponse.data[0] : identityResponse.data) as CanonicalIdentity | null
  }))
  return buildCanonicalPublicPlayerChoices(activePlayers, identities).map((player): PublicProfileSearchPlayer => ({
    id: player.id,
    screen_name: player.screen_name,
    avatar_path: player.avatar_path,
  }))
}
