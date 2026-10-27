import "server-only"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { normalizeCurrentKwtIdentity, parseCurrentKwtCsv, type CurrentKwtSetup } from "@/lib/kwt/currentSeasonCsv"
import { validateCurrentKwtRoster, type KwtRosterMembership } from "@/lib/kwt/currentSeasonRoster"
import { trustedTournamentClient } from "@/lib/tournaments/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Player = { id: string; screen_name: string }
type Alias = { player_id: string; alias: string | null; normalized_alias: string | null; verified: boolean | null }
type Link = { historical_player_id: string; canonical_player_id: string }

function parseSetup(row: { label: string | null; season_number: number; week_number: number; start_date: string | null; end_date: string | null }): CurrentKwtSetup | null {
  if (!row.label) return null
  try {
    const data = JSON.parse(row.label) as Record<string, unknown>
    const setup = {
      season: row.season_number,
      week: row.week_number,
      eventIdentifier: String(data.eventIdentifier ?? ""),
      courseName: String(data.courseName ?? ""),
      easyCourseCode: String(data.easyCourseCode ?? ""),
      hardCourseCode: String(data.hardCourseCode ?? ""),
    }
    return setup.eventIdentifier && setup.easyCourseCode && setup.hardCourseCode ? setup : null
  } catch {
    return null
  }
}

function canonicalResolver(links: Link[]) {
  const next = new Map(links.map((link) => [link.historical_player_id, link.canonical_player_id]))
  return (id: string) => {
    let current = id
    const visited = new Set<string>()
    while (next.has(current) && !visited.has(current)) {
      visited.add(current)
      current = next.get(current) as string
    }
    return current
  }
}

async function loadIdentityDirectory() {
  const client = trustedTournamentClient()
  const [playersResponse, aliasesResponse, linksResponse] = await Promise.all([
    client.from("players").select("id,screen_name").order("screen_name", { ascending: true }),
    client.from("player_aliases").select("player_id,alias,normalized_alias,verified").eq("verified", true),
    client.from("player_identity_links").select("historical_player_id,canonical_player_id"),
  ])
  const error = playersResponse.error || aliasesResponse.error || linksResponse.error
  if (error) throw new Error(`Canonical identity directory unavailable: ${error.message}`)
  const players = (playersResponse.data ?? []) as Player[]
  const resolve = canonicalResolver((linksResponse.data ?? []) as Link[])
  const byId = new Map(players.map((player) => [player.id, player]))
  const byName = new Map<string, Array<{ id: string; name: string }>>()
  const add = (value: string | null | undefined, playerId: string) => {
    const normalized = normalizeCurrentKwtIdentity(value ?? "")
    if (!normalized) return
    const canonicalId = resolve(playerId)
    const player = byId.get(canonicalId) ?? byId.get(playerId)
    if (!player) return
    const list = byName.get(normalized) ?? []
    if (!list.some((candidate) => candidate.id === canonicalId)) list.push({ id: canonicalId, name: player.screen_name })
    byName.set(normalized, list)
  }
  for (const player of players) add(player.screen_name, player.id)
  for (const alias of (aliasesResponse.data ?? []) as Alias[]) add(alias.normalized_alias || alias.alias, alias.player_id)
  return { players, byName }
}

async function loadSetup() {
  const client = trustedTournamentClient()
  const response = await client.from("kwt_public_content")
    .select("label,season_number,week_number,start_date,end_date")
    .eq("content_type", "kwt_week_setup")
    .eq("active", true)
    .order("season_number", { ascending: false })
    .order("week_number", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (response.error) throw new Error(`Verified KWT Week Setup could not be read: ${response.error.message}`)
  return response.data ? parseSetup(response.data) : null
}

async function loadRoster(season: number) {
  const client = trustedTournamentClient()
  const response = await client.from("player_league_memberships")
    .select("player_id,division")
    .eq("league_type", "kwt")
    .eq("season_number", season)
  if (response.error) throw new Error(`Season ${season} KWT roster could not be read: ${response.error.message}`)
  return (response.data ?? []).map((row) => ({ playerId: row.player_id as string, division: row.division as string })) as KwtRosterMembership[]
}

function decorateRosterRows(rows: unknown[], memberships: KwtRosterMembership[]) {
  return rows.map((row) => {
    const mapped = row as Record<string, unknown>
    const issue = validateCurrentKwtRoster({
      sourceRow: Number(mapped.sourceRow ?? 0),
      rawPlayerName: String(mapped.rawPlayerName ?? ""),
      canonicalName: String(mapped.canonicalName ?? ""),
      canonicalPlayerId: String(mapped.canonicalPlayerId ?? ""),
      division: typeof mapped.division === "string" ? mapped.division : null,
    }, memberships)
    const validationErrors = Array.isArray(mapped.validationErrors) ? mapped.validationErrors.map(String) : []
    if (issue) validationErrors.push(issue.message)
    return { ...mapped, validationErrors, rosterStatus: issue?.status ?? "PRESENT", rosterDivision: issue?.rosterDivision ?? null, rosterMessage: issue?.message ?? null }
  })
}

async function loadBatch(batchId?: string, roster?: KwtRosterMembership[]) {
  const client = trustedTournamentClient()
  const batchesResponse = await client.from("kwt_current_import_batches")
    .select("id,source_filename,source_sha256,source_season,source_week,event_identifier,course_name,easy_course_code,hard_course_code,result_status,status,rows_found,matched_rows,error_rows,inserted_rows,corrected_rows,unchanged_rows,created_at,committed_at")
    .order("created_at", { ascending: false }).limit(20)
  if (batchesResponse.error) throw new Error(`KWT importer history could not be read: ${batchesResponse.error.message}`)
  const batch = batchId ? (batchesResponse.data ?? []).find((candidate) => candidate.id === batchId) : null
  let rows: unknown[] = []
  if (batchId) {
    const rowsResponse = await client.from("kwt_current_import_rows")
      .select("id,batch_id,source_row,source_fingerprint,raw_player_name,canonical_player_id,canonical_name,identity_status,identity_note,validation_errors,division,easy_course_code,hard_course_code,easy_score,hard_score,total_score,overall_placement,division_placement,points,badges,easy_holes,hard_holes,raw_data")
      .eq("batch_id", batchId).order("source_row", { ascending: true })
    if (rowsResponse.error) throw new Error(`KWT importer rows could not be read: ${rowsResponse.error.message}`)
    rows = (rowsResponse.data ?? []).map((row) => mapDbRow(row as Record<string, unknown>))
    if (roster) rows = decorateRosterRows(rows, roster)
  }
  const effectiveErrorRows = batch && roster && rows.length
    ? rows.filter((row) => Array.isArray((row as Record<string, unknown>).validationErrors) && ((row as Record<string, unknown>).validationErrors as string[]).length > 0).length
    : batch?.error_rows ?? 0
  return { batches: batchesResponse.data ?? [], batch: batch ? { ...batch, error_rows: effectiveErrorRows } : null, rows }
}

function jsonRow(row: Record<string, unknown>, candidates: Map<string, Array<{ id: string; name: string }>>) {
  const rawName = String(row.rawPlayerName ?? "")
  const matches = candidates.get(normalizeCurrentKwtIdentity(rawName)) ?? []
  const identityStatus = matches.length === 1 ? "MATCHED" : matches.length > 1 ? "AMBIGUOUS" : "UNKNOWN"
  const validationErrors = Array.isArray(row.validationErrors) ? row.validationErrors.map(String) : []
  if (identityStatus !== "MATCHED") validationErrors.push(`identity: ${identityStatus === "AMBIGUOUS" ? "multiple canonical players match this name" : "no verified canonical player matches this name"}.`)
  return {
    ...row,
    identityStatus,
    canonicalPlayerId: matches[0]?.id ?? "",
    canonicalName: matches[0]?.name ?? "",
    identityNote: matches.length > 1 ? matches.map((match) => match.name).join(", ") : "",
    validationErrors,
  }
}

function mapDbRow(row: Record<string, unknown>) {
  return {
    ...row,
    sourceRow: row.source_row,
    rawPlayerName: row.raw_player_name,
    canonicalPlayerId: row.canonical_player_id ?? "",
    canonicalName: row.canonical_name ?? "",
    identityStatus: row.identity_status,
    identityNote: row.identity_note ?? "",
    validationErrors: Array.isArray(row.validation_errors) ? row.validation_errors.map(String) : [],
    division: row.division ?? null,
    easyScore: row.easy_score ?? null,
    hardScore: row.hard_score ?? null,
    totalScore: row.total_score ?? null,
    overallPlacement: row.overall_placement ?? null,
    divisionPlacement: row.division_placement ?? null,
    points: row.points ?? null,
  }
}

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    const [setup, identityDirectory] = await Promise.all([loadSetup(), loadIdentityDirectory()])
    const batchId = new URL(request.url).searchParams.get("batchId") ?? undefined
    if (batchId) {
      const refreshed = await authorization.supabase.rpc("refresh_kwt_current_import_placements", { p_batch_id: batchId })
      if (refreshed.error) throw new Error(`KWT gross placement preview could not be refreshed: ${refreshed.error.message}`)
    }
    const roster = setup ? await loadRoster(setup.season) : []
    const data = await loadBatch(batchId, roster)
    return Response.json({
      setup,
      players: identityDirectory.players,
      rosterCount: roster.length,
      ...data,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "KWT importer could not be loaded." }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    const contentType = request.headers.get("content-type") ?? ""
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData()
      const file = form.get("file")
      const season = Number(form.get("season"))
      const week = Number(form.get("week"))
      if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) return Response.json({ error: "Choose one CSV file." }, { status: 400 })
      if (file.size > 10_000_000) return Response.json({ error: "CSV files must be 10 MB or smaller." }, { status: 400 })
      const setup = await loadSetup()
      if (!setup || setup.season !== season || setup.week !== week) return Response.json({ error: "The selected Season/Week is not the active verified KWT Week Setup." }, { status: 409 })
      const bytes = new Uint8Array(await file.arrayBuffer())
      const parsed = parseCurrentKwtCsv(bytes, file.name, setup)
      const identityDirectory = await loadIdentityDirectory()
      const rows = parsed.rows.map((row) => jsonRow(row as unknown as Record<string, unknown>, identityDirectory.byName))
      const staged = await authorization.supabase.rpc("stage_kwt_current_import", {
        p_source_filename: file.name,
        p_source_sha256: parsed.sourceSha256,
        p_source_season: season,
        p_source_week: week,
        p_event_identifier: setup.eventIdentifier,
        p_course_name: setup.courseName,
        p_easy_course_code: setup.easyCourseCode,
        p_hard_course_code: setup.hardCourseCode,
        p_result_status: "official",
        p_rows: rows,
      })
      if (staged.error) return Response.json({ error: staged.error.message }, { status: 400 })
      const result = Array.isArray(staged.data) ? staged.data[0] : staged.data
      const refreshed = await authorization.supabase.rpc("refresh_kwt_current_import_placements", { p_batch_id: result.batch_id })
      if (refreshed.error) return Response.json({ error: `Gross placement preview could not be refreshed: ${refreshed.error.message}` }, { status: 503 })
      const roster = await loadRoster(setup.season)
      const data = await loadBatch(result.batch_id, roster)
      return Response.json({ setup, parsed: { ...parsed, rows }, ...data }, { headers: { "Cache-Control": "no-store" } })
    }

    const body = await request.json() as { action?: string; batchId?: string; rowId?: string; canonicalPlayerId?: string; identityNote?: string; division?: string; allowCorrections?: boolean; correctionReason?: string }
    if (body.action === "resolve_identity") {
      if (!body.batchId || !body.rowId || !body.canonicalPlayerId) return Response.json({ error: "Batch, row, and canonical player are required." }, { status: 400 })
      const response = await authorization.supabase.rpc("set_kwt_current_import_identity", { p_batch_id: body.batchId, p_row_id: body.rowId, p_canonical_player_id: body.canonicalPlayerId, p_identity_note: body.identityNote ?? null })
      if (response.error) return Response.json({ error: response.error.message }, { status: 400 })
      const setup = await loadSetup()
      return Response.json(await loadBatch(body.batchId, setup ? await loadRoster(setup.season) : []), { headers: { "Cache-Control": "no-store" } })
    }
    if (body.action === "enroll_roster") {
      if (!body.batchId || !body.rowId || !body.canonicalPlayerId || !body.division) return Response.json({ error: "Batch, row, canonical player, and exact CSV division are required." }, { status: 400 })
      const stagedRow = await trustedTournamentClient().from("kwt_current_import_rows").select("canonical_player_id,division,identity_status").eq("id", body.rowId).eq("batch_id", body.batchId).maybeSingle()
      if (stagedRow.error) return Response.json({ error: stagedRow.error.message }, { status: 400 })
      if (!stagedRow.data || stagedRow.data.canonical_player_id !== body.canonicalPlayerId || stagedRow.data.division !== body.division || !["MATCHED", "MANUAL"].includes(stagedRow.data.identity_status)) return Response.json({ error: "The selected row no longer matches the reviewed canonical identity and division." }, { status: 409 })
      const setup = await loadSetup()
      if (!setup) return Response.json({ error: "No active verified KWT Week Setup is available." }, { status: 409 })
      const response = await authorization.supabase.rpc("admin_add_player_league_membership", { p_player_id: body.canonicalPlayerId, p_league_type: "kwt", p_season_number: setup.season, p_division: body.division })
      if (response.error) return Response.json({ error: response.error.message }, { status: 409 })
      return Response.json(await loadBatch(body.batchId, await loadRoster(setup.season)), { headers: { "Cache-Control": "no-store" } })
    }
    if (body.action === "commit") {
      if (!body.batchId) return Response.json({ error: "Batch is required." }, { status: 400 })
      const setup = await loadSetup()
      const preflight = await loadBatch(body.batchId, setup ? await loadRoster(setup.season) : [])
      const rosterIssues = preflight.rows.filter((row) => {
        const value = row as Record<string, unknown>
        return value.rosterStatus === "MISSING" || value.rosterStatus === "DIVISION_MISMATCH"
      }).map((row) => {
        const value = row as Record<string, unknown>
        return { sourceRow: value.sourceRow, canonicalName: value.canonicalName, division: value.division, rosterStatus: value.rosterStatus, rosterDivision: value.rosterDivision }
      })
      if (rosterIssues.length) return Response.json({ error: "Review every Season 15 KWT roster issue before applying this import.", code: "KWT_ROSTER_PREFLIGHT_FAILED", rosterIssues, ...preflight }, { status: 409 })
      const response = await authorization.supabase.rpc("commit_kwt_current_import", { p_batch_id: body.batchId, p_allow_corrections: Boolean(body.allowCorrections), p_correction_reason: body.correctionReason ?? null })
      if (response.error) return Response.json({ error: response.error.message }, { status: 409 })
      return Response.json({ result: Array.isArray(response.data) ? response.data[0] : response.data, ...(await loadBatch(body.batchId, setup ? await loadRoster(setup.season) : [])) }, { headers: { "Cache-Control": "no-store" } })
    }
    return Response.json({ error: "Unknown importer action." }, { status: 400 })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "KWT import failed." }, { status: 400 })
  }
}
