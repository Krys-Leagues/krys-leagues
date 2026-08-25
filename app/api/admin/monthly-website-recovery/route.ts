import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { createClient } from "@supabase/supabase-js"
import Papa from "papaparse"
import { previewMonthlyWebsiteCsvRows } from "@/lib/importer/adapters/monthlyWebsiteAdapter"
import { matchPlayers, type PlayerMatch } from "@/lib/importer/matchPlayers"
import { normalizeIdentity } from "@/lib/identity/normalizeIdentity"

type Manifest = {
  normalizedCsvSha256: string
  rawRenderedRows: number
  scoreObservations: number
  missingScoreObservations: number
  coverage: { earliest: string; latest: string; periodCount: number; periods: string[] }
  finalization: { finalizedThrough: string; activePeriodPolicy: string; currentPeriodReason: string }
}
type PlayerRow = { id: string; screen_name: string; discord_name: string | null; discord_username: string | null; discord_id: string | null; active: boolean; status: string | null }
type AliasRow = { id: string; player_id: string; alias: string; normalized_alias: string; source: string | null; verified: boolean }
type LinkRow = { historical_player_id: string; canonical_player_id: string }
const root = join(process.cwd(), "docs", "historical-sources", "monthly", "website-recovery")

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
}

async function authorizedAdmin(request: Request) {
  const [scheme, accessToken] = (request.headers.get("authorization") ?? "").split(" ")
  if (scheme?.toLowerCase() !== "bearer" || !accessToken) return { error: jsonError("Authentication is required.", 401) }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
  if (userError || !userData.user) return { error: jsonError("The authenticated session is invalid.", 401) }
  const { data: siteAdmin, error: authorizationError } = await supabase.rpc("is_current_user_site_admin")
  if (authorizationError) return { error: jsonError("Administrator authorization could not be verified.", 503) }
  if (!siteAdmin) return { error: jsonError("Administrator authorization is required.", 403) }
  return { supabase }
}

function canonicalId(playerId: string, links: LinkRow[]) {
  const direct = new Map(links.map(link => [link.historical_player_id, link.canonical_player_id]))
  const visited = new Set<string>()
  let current = playerId
  while (direct.has(current) && !visited.has(current)) {
    visited.add(current)
    current = direct.get(current)!
  }
  return current
}

function publicMatch(name: string, match: PlayerMatch | undefined) {
  const resolved = Boolean(match?.playerId && match.autoLinkEligible && match.confidence === 100)
  return {
    key: normalizeIdentity(name),
    historicalName: name,
    status: resolved ? "resolved" as const : match?.status === "close" || match?.status === "exact" ? "ambiguous" as const : "unresolved" as const,
    playerId: resolved ? match?.playerId ?? null : null,
    playerName: resolved ? match?.matchedName ?? null : null,
    confidence: match?.confidence ?? 0,
    evidence: match?.evidence ?? "none",
  }
}

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const authorized = await authorizedAdmin(request)
  if (authorized.error) return authorized.error
  try {
    const [manifestText, csvText] = await Promise.all([
      readFile(join(root, "monthly-website-source-manifest.json"), "utf8"),
      readFile(join(root, "monthly-website-score-observations.csv"), "utf8"),
    ])
    const manifest = JSON.parse(manifestText) as Manifest
    const sourceSha256 = createHash("sha256").update(csvText, "utf8").digest("hex")
    if (sourceSha256 !== manifest.normalizedCsvSha256) throw new Error("source_sha_mismatch")
    const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true })
    if (parsed.errors.length) throw new Error("csv_parse_error")
    const preview = previewMonthlyWebsiteCsvRows(parsed.data, { finalizedThrough: manifest.finalization.finalizedThrough })
    if (preview.summary.totalRows !== manifest.rawRenderedRows || preview.summary.scoreRows !== manifest.scoreObservations || preview.summary.missingScoreRows !== manifest.missingScoreObservations) throw new Error("source_count_mismatch")
    if (preview.summary.duplicateRows || preview.summary.conflictingRows || preview.summary.totalMismatches) throw new Error("source_validation_error")

    const [playersResult, aliasesResult, linksResult, importsResult, scoreCountResult] = await Promise.all([
      authorized.supabase.from("players").select("id, screen_name, discord_name, discord_username, discord_id, active, status").order("screen_name"),
      authorized.supabase.from("player_aliases").select("id, player_id, alias, normalized_alias, source, verified").eq("verified", true).order("alias"),
      authorized.supabase.from("player_identity_links").select("historical_player_id, canonical_player_id"),
      authorized.supabase.from("historical_monthly_imports").select("id, source_sha256, source_row_count, applied_row_count, committed_by, committed_at").eq("source_sha256", sourceSha256),
      authorized.supabase.from("historical_monthly_score_observations").select("id", { count: "exact", head: true }),
    ])
    if (playersResult.error || aliasesResult.error || linksResult.error) throw new Error("identity_load_error")
    const links = (linksResult.data ?? []) as LinkRow[]
    const allPlayers = (playersResult.data ?? []) as PlayerRow[]
    const players = allPlayers.filter(player => canonicalId(player.id, links) === player.id)
    const aliases = ((aliasesResult.data ?? []) as AliasRow[]).map(alias => ({ ...alias, player_id: canonicalId(alias.player_id, links) }))
    const historicalNames = [...new Map(preview.rows.filter(row => row.importable).map(row => [normalizeIdentity(row.historicalPlayerName), row.historicalPlayerName])).values()]
    const playerRecords = players.map(player => ({ ...player }))
    const identityAliases = aliases.map(alias => ({ id: alias.id, playerId: alias.player_id, aliasName: alias.alias, normalizedAlias: alias.normalized_alias, source: "historical_alias" as const, active: true, verified: alias.verified }))
    const matchResults = matchPlayers(historicalNames, playerRecords, identityAliases, links.map(link => ({ historicalPlayerId: link.historical_player_id, canonicalPlayerId: link.canonical_player_id })))
    const identityCandidates = historicalNames.map((name, index) => publicMatch(name, matchResults[index]))
    const periods = [...new Map(preview.rows.map(row => [row.period, row])).values()]
      .sort((left, right) => left.year - right.year || left.month - right.month)
      .map(period => {
        const periodRows = preview.rows.filter(row => row.period === period.period)
        return {
          period: period.period,
          year: period.year,
          month: period.month,
          status: period.periodStatus,
          importable: period.importable,
          reason: period.periodBlockReason,
          rows: periodRows.length,
          scoredRows: periodRows.filter(row => row.score !== null).length,
          missingScoreRows: periodRows.filter(row => row.score === null).length,
        }
      })
    return Response.json({ parserVersion: "historical-monthly-website-v2-period-gated", sourceFile: "monthly-website-score-observations.csv", sourceSha256, manifest, validation: preview.summary, rows: preview.rows, periods, identityCandidates, players, aliases, links, existingImport: importsResult.error ? null : importsResult.data?.[0] ?? null, existingScoreCount: scoreCountResult.error ? null : scoreCountResult.count ?? 0 }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return jsonError("The preserved Monthly source could not be loaded or validated.", 500)
  }
}
