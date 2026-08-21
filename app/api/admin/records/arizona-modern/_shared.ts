import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { matchPlayers } from "@/lib/importer/matchPlayers"
import type { PlayerIdentityAlias } from "@/lib/identity"

type PlayerRow = { id: string; screen_name: string; discord_name: string | null; discord_username: string | null; discord_id: string | null; active: boolean }
type AliasRow = { id: string; player_id: string; alias: string; normalized_alias: string; source: string | null; verified: boolean }
type IdentityLinkRow = { historical_player_id: string; canonical_player_id: string }

export async function authorizedAdminClient(request: Request) {
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ")
  if (scheme?.toLowerCase() !== "bearer" || !token) return { error: Response.json({ error: "Authentication is required." }, { status: 401 }) }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) return { error: Response.json({ error: "The session is invalid." }, { status: 401 }) }
  const { data: authorized, error } = await supabase.rpc("is_current_user_site_admin")
  if (error || !authorized) return { error: Response.json({ error: "Site-admin authorization is required." }, { status: 403 }) }
  return { supabase }
}

export async function loadIdentityDirectory(supabase: SupabaseClient) {
  const [playersResult, aliasesResult, linksResult] = await Promise.all([
    supabase.from("players").select("id, screen_name, discord_name, discord_username, discord_id, active").order("screen_name"),
    supabase.from("player_aliases").select("id, player_id, alias, normalized_alias, source, verified").eq("verified", true).order("alias"),
    supabase.from("player_identity_links").select("historical_player_id, canonical_player_id"),
  ])
  if (playersResult.error) throw new Error(`Could not load Global Players: ${playersResult.error.message}`)
  if (aliasesResult.error) throw new Error(`Could not load verified aliases: ${aliasesResult.error.message}`)
  if (linksResult.error) throw new Error(`Could not load identity redirects: ${linksResult.error.message}`)
  const rawPlayers = (playersResult.data ?? []) as PlayerRow[]
  const rawLinks = (linksResult.data ?? []) as IdentityLinkRow[]
  const direct = new Map(rawLinks.map((link) => [link.historical_player_id, link.canonical_player_id]))
  const canonicalId = (playerId: string) => { const visited = new Set<string>(); let current = playerId; while (direct.has(current) && !visited.has(current)) { visited.add(current); current = direct.get(current)! } return current }
  const aliases: PlayerIdentityAlias[] = ((aliasesResult.data ?? []) as AliasRow[]).map((row) => ({ id: row.id, playerId: canonicalId(row.player_id), aliasName: row.alias, normalizedAlias: row.normalized_alias, source: row.source === "manual" || row.source === "import" || row.source === "discord_name" || row.source === "screen_name" || row.source === "historical_alias" ? row.source : "unknown", active: true, verified: row.verified }))
  const links = rawLinks.map((link) => ({ historicalPlayerId: link.historical_player_id, canonicalPlayerId: link.canonical_player_id }))
  return { rawPlayers, canonicalId, matchNames: (names: string[]) => matchPlayers(names, rawPlayers, aliases, links) }
}
