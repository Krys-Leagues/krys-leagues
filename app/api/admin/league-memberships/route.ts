import "server-only"

import { createClient } from "@supabase/supabase-js"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const LEAGUES = new Set(["stroke", "match", "pyp", "pro", "doubles", "kwt", "skins"])

type MembershipBody = {
  action?: "add" | "remove"
  player_id?: string
  membership_id?: string
  league_type?: string
  season_number?: number
  division?: string
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("League membership server access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
}

async function resolveSeasonNumber(client: ReturnType<typeof adminClient>, leagueType: string, requested: string | null) {
  if (requested) {
    const parsed = Number(requested)
    if (Number.isInteger(parsed) && parsed > 0) return parsed
  }

  const currentSeason = await client
    .from("seasons")
    .select("season_number, is_active")
    .eq("league_type", leagueType)
    .is("division", null)
    .order("is_active", { ascending: false })
    .order("season_number", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (currentSeason.error) throw currentSeason.error
  if (currentSeason.data?.season_number) return currentSeason.data.season_number

  const divisionSeason = await client
    .from("seasons")
    .select("season_number, is_active")
    .eq("league_type", leagueType)
    .order("is_active", { ascending: false })
    .order("season_number", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (divisionSeason.error) throw divisionSeason.error
  if (divisionSeason.data?.season_number) return divisionSeason.data.season_number

  const latestMembership = await client
    .from("player_league_memberships")
    .select("season_number")
    .eq("league_type", leagueType)
    .order("season_number", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestMembership.error) throw latestMembership.error
  return latestMembership.data?.season_number ?? null
}

async function loadDirectory(client: ReturnType<typeof adminClient>, search: string) {
  const [playersResult, aliasesResult, linksResult] = await Promise.all([
    client.from("players").select("id, screen_name, status, active").order("screen_name"),
    client.from("player_aliases").select("player_id, alias, verified").eq("verified", true),
    client.from("player_identity_links").select("historical_player_id, canonical_player_id"),
  ])
  const error = playersResult.error || aliasesResult.error || linksResult.error
  if (error) throw error

  const links = new Map<string, string>((linksResult.data || []).map((link) => [link.historical_player_id, link.canonical_player_id]))
  const aliases = new Map<string, string[]>()
  for (const row of aliasesResult.data || []) {
    const canonicalId = links.get(row.player_id) || row.player_id
    const values = aliases.get(canonicalId) || []
    values.push(row.alias)
    aliases.set(canonicalId, values)
  }

  const query = normalizeSearch(search)
  return (playersResult.data || [])
    .filter((player) => !links.has(player.id))
    .filter((player) => player.active !== false && player.status !== "inactive" && player.status !== "archived")
    .map((player) => ({
      id: player.id,
      screen_name: player.screen_name,
      aliases: [...new Set(aliases.get(player.id) || [])].sort((a, b) => a.localeCompare(b)),
    }))
    .filter((player) => {
      if (!query) return true
      return [player.screen_name, ...player.aliases].some((value) => normalizeSearch(value).includes(query))
    })
    .slice(0, 50)
}

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const params = new URL(request.url).searchParams
  const leagueType = params.get("league_type")?.trim().toLowerCase() || ""
  if (!LEAGUES.has(leagueType)) return json({ error: "A supported league_type is required." }, 400)

  try {
    const client = adminClient()
    if (params.get("mode") === "directory") {
      return json({ players: await loadDirectory(client, params.get("q") || "") })
    }

    const seasonNumber = await resolveSeasonNumber(client, leagueType, params.get("season_number"))
    if (!seasonNumber) return json({ league_type: leagueType, season_number: null, memberships: [], players: [] })

    let query = client
      .from("player_league_memberships")
      .select("id, player_id, league_type, season_number, division")
      .eq("league_type", leagueType)
      .eq("season_number", seasonNumber)
      .order("division")
      .order("created_at")
    const division = params.get("division")?.trim()
    if (division) query = query.eq("division", division)
    const memberships = await query
    if (memberships.error) return json({ error: memberships.error.message }, 503)

    const playerIds = [...new Set((memberships.data || []).map((membership) => membership.player_id).filter((id): id is string => Boolean(id)))]
    const players = playerIds.length
      ? await client.from("players").select("id, screen_name, status, active").in("id", playerIds).order("screen_name")
      : { data: [], error: null }
    if (players.error) return json({ error: players.error.message }, 503)
    const names = new Map((players.data || []).map((player) => [player.id, player]))
    const enriched = (memberships.data || []).map((membership) => ({
      ...membership,
      screen_name: membership.player_id ? names.get(membership.player_id)?.screen_name || null : null,
      status: membership.player_id ? names.get(membership.player_id)?.status || null : null,
      active: membership.player_id ? names.get(membership.player_id)?.active ?? null : null,
    }))

    return json({ league_type: leagueType, season_number: seasonNumber, memberships: enriched, players: players.data || [] })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "League membership data could not be loaded." }, 503)
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  let body: MembershipBody
  try {
    body = await request.json() as MembershipBody
  } catch {
    return json({ error: "Invalid JSON body." }, 400)
  }

  if (body.action !== "add") return json({ error: "Unsupported membership action." }, 400)
  const leagueType = body.league_type?.trim().toLowerCase() || ""
  if (!LEAGUES.has(leagueType) || !body.player_id || !body.division || typeof body.season_number !== "number" || !Number.isInteger(body.season_number) || body.season_number <= 0) {
    return json({ error: "player_id, league_type, season_number, and division are required." }, 400)
  }
  const seasonNumber = body.season_number

  try {
    const client = adminClient()
    const [player, historicalLink, existing] = await Promise.all([
      client.from("players").select("id, status, active").eq("id", body.player_id).maybeSingle(),
      client.from("player_identity_links").select("historical_player_id").eq("historical_player_id", body.player_id).maybeSingle(),
      client.from("player_league_memberships").select("id").eq("player_id", body.player_id).eq("league_type", leagueType).eq("season_number", seasonNumber).eq("division", body.division).maybeSingle(),
    ])
    if (player.error || historicalLink.error || existing.error) return json({ error: (player.error || historicalLink.error || existing.error)?.message }, 503)
    if (!player.data) return json({ error: "Canonical player was not found." }, 404)
    if (player.data.active === false || player.data.status === "inactive" || player.data.status === "archived") return json({ error: "Only active canonical players can be enrolled." }, 400)
    if (historicalLink.data) return json({ error: "Use the canonical player identity for league membership." }, 400)
    if (existing.data) return json({ error: "This player is already enrolled in this league division for the selected season." }, 409)

    const result = await client
      .from("player_league_memberships")
      .insert({ player_id: body.player_id, league_type: leagueType, season_number: seasonNumber, division: body.division })
      .select("id, player_id, league_type, season_number, division")
      .single()
    if (result.error) return json({ error: result.error.message }, 503)
    return json({ membership: result.data })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "League membership could not be added." }, 503)
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  let body: MembershipBody
  try {
    body = await request.json() as MembershipBody
  } catch {
    return json({ error: "Invalid JSON body." }, 400)
  }
  if (!body.membership_id) return json({ error: "membership_id is required." }, 400)

  try {
    const result = await adminClient().from("player_league_memberships").delete().eq("id", body.membership_id).select("id").maybeSingle()
    if (result.error) return json({ error: result.error.message }, 503)
    if (!result.data) return json({ error: "League membership was not found." }, 404)
    return json({ removed: result.data.id })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "League membership could not be removed." }, 503)
  }
}
