import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { createClient } from "@supabase/supabase-js"
import Papa from "papaparse"
import { parseHistoricalKwtRows } from "@/lib/importer/adapters/kwtAdapter"
import identityCandidates from "@/docs/historical-sources/kwt/website-score-recovery/identity-candidates.json"

type SourceCatalogEntry = {
  id: string
  seasonNumber: number
  weekNumber: number
  easy: string
  hard: string
}

type RawManifestEntry = {
  sourceId: string
  sourceUrl: string
  rawPath: string
  sha256: string
}

type PlayerRow = {
  id: string
  screen_name: string
  discord_name: string | null
  discord_username: string | null
  discord_id: string | null
  active: boolean
  status: string | null
}

type AliasRow = {
  id: string
  player_id: string
  alias: string
  normalized_alias: string
  source: string | null
  verified: boolean
}

type LinkRow = {
  historical_player_id: string
  canonical_player_id: string
}

const root = join(process.cwd(), "docs", "historical-sources", "kwt", "website-score-recovery")

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
}

async function authorizedAdmin(request: Request) {
  const [scheme, accessToken] = (request.headers.get("authorization") ?? "").split(" ")
  if (scheme?.toLowerCase() !== "bearer" || !accessToken) return { error: jsonError("Authentication is required.", 401) }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    },
  )
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
  if (userError || !userData.user) return { error: jsonError("The authenticated session is invalid.", 401) }
  const { data: siteAdmin, error: authorizationError } = await supabase.rpc("is_current_user_site_admin")
  if (authorizationError) return { error: jsonError("Administrator authorization could not be verified.", 503) }
  if (!siteAdmin) return { error: jsonError("Administrator authorization is required.", 403) }
  return { supabase }
}

function canonicalId(playerId: string, links: LinkRow[]) {
  const direct = new Map(links.map((link) => [link.historical_player_id, link.canonical_player_id]))
  const visited = new Set<string>()
  let current = playerId
  while (direct.has(current) && !visited.has(current)) {
    visited.add(current)
    current = direct.get(current)!
  }
  return current
}

async function readRecoverySources() {
  const [catalogText, manifestText] = await Promise.all([
    readFile(join(root, "source-catalog.json"), "utf8"),
    readFile(join(root, "raw-response-manifest.json"), "utf8"),
  ])
  const catalog = JSON.parse(catalogText) as SourceCatalogEntry[]
  const manifest = JSON.parse(manifestText) as { sources: RawManifestEntry[] }
  const manifestById = new Map(manifest.sources.map((source) => [source.sourceId, source]))

  return Promise.all(catalog.map(async (source) => {
    const filename = `${source.id}.csv`
    const text = await readFile(join(root, "normalized", filename), "utf8")
    const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true })
    const result = parseHistoricalKwtRows(parsed.data, filename)
    const manifestSource = manifestById.get(source.id)
    if (!manifestSource) throw new Error(`Missing raw source manifest entry for ${source.id}.`)
    return {
      sourceId: source.id,
      fileName: filename,
      season: source.seasonNumber,
      week: source.weekNumber,
      easyCourseCode: source.easy,
      hardCourseCode: source.hard,
      sourceUrl: manifestSource.sourceUrl,
      sourceSha256: manifestSource.sha256,
      normalizedSha256: createHash("sha256").update(text, "utf8").digest("hex"),
      rows: result.rows,
      errors: [...parsed.errors.map((error) => `${filename}: ${error.message}`), ...result.errors],
      warnings: result.warnings,
      duplicateRows: result.duplicateRows,
    }
  }))
}

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const authorized = await authorizedAdmin(request)
  if (authorized.error) return authorized.error

  try {
    const [sources, playersResult, aliasesResult, linksResult, importsResult, scorecardsResult] = await Promise.all([
      readRecoverySources(),
      authorized.supabase.from("players").select("id, screen_name, discord_name, discord_username, discord_id, active, status").order("screen_name"),
      authorized.supabase.from("player_aliases").select("id, player_id, alias, normalized_alias, source, verified").eq("verified", true).order("alias"),
      authorized.supabase.from("player_identity_links").select("historical_player_id, canonical_player_id"),
      authorized.supabase.from("historical_kwt_imports").select("source_sha256"),
      authorized.supabase.from("historical_kwt_scorecards").select("id", { count: "exact", head: true }),
    ])

    if (playersResult.error || aliasesResult.error || linksResult.error) {
      throw new Error(`Canonical Global Player data could not be loaded: ${playersResult.error?.message || aliasesResult.error?.message || linksResult.error?.message}`)
    }

    const links = (linksResult.data ?? []) as LinkRow[]
    const players = ((playersResult.data ?? []) as PlayerRow[])
      .filter((player) => canonicalId(player.id, links) === player.id)
      .map((player) => ({ ...player, id: player.id }))
    const aliases = ((aliasesResult.data ?? []) as AliasRow[]).map((alias) => ({
      ...alias,
      player_id: canonicalId(alias.player_id, links),
    }))

    return Response.json({
      parserVersion: "historical-kwt-v1",
      source: "KWT result-table HTML, read-only extraction; KR excluded",
      sources,
      identityCandidates: identityCandidates.candidates,
      players,
      aliases,
      links,
      existingSourceShas: importsResult.error ? [] : (importsResult.data ?? []).map((row) => row.source_sha256),
      existingScorecardCount: scorecardsResult.error ? null : scorecardsResult.count ?? 0,
      databaseReadError: importsResult.error?.message || scorecardsResult.error?.message || null,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "The recovered KWT sources could not be loaded.", 500)
  }
}
