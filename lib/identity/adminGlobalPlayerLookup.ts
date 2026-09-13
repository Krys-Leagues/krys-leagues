import "server-only"

import { createClient } from "@supabase/supabase-js"

import { canonicalAdminPlayerChoices, type AdminGlobalPlayerRow, type AdminIdentityLinkRow } from "@/lib/identity/adminGlobalPlayerCore"

export { canonicalAdminPlayerChoices } from "@/lib/identity/adminGlobalPlayerCore"

function createAdminDataClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Admin Global Players server access is not configured.")

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function loadAdminGlobalPlayers(search = "") {
  const client = createAdminDataClient()
  const [playersResult, linksResult] = await Promise.all([
    client
      .from("players")
      .select("id,screen_name,status,active")
      .order("screen_name"),
    client
      .from("player_identity_links")
      .select("historical_player_id,canonical_player_id"),
  ])

  const error = playersResult.error || linksResult.error
  if (error) throw error

  return canonicalAdminPlayerChoices(
    (playersResult.data ?? []) as AdminGlobalPlayerRow[],
    (linksResult.data ?? []) as AdminIdentityLinkRow[],
    search,
  )
}
