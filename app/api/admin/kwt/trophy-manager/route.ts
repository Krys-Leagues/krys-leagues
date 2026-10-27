import "server-only"

import { createHash } from "node:crypto"
import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { loadVerifiedKwtNetPayload } from "@/lib/kwtNetServer"
import { buildKwtDisplayRanks, standardCompetitionRanks } from "@/lib/kwtNetCompetition"
import { DEFAULT_KWT_TROPHY_PLACEMENT, inspectPng, renderKwtPersonalizedTrophy, type KwtTrophyPlacement } from "@/lib/kwt/trophyManager"
import { trustedTournamentClient } from "@/lib/tournaments/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUCKET = "tournament-trophies"
const MAX_BYTES = 12 * 1024 * 1024
const AWARD_CATEGORIES = new Set(["GROSS", "NET", "OTHER"])
const AWARD_SCOPES = new Set(["overall", "division", "historical"])
const TEMPLATE_KINDS = new Set(["individual", "historical_personalized", "commemorative"])

function jsonError(message: string, status = 400) { return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } }) }
function sha256(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex") }
function parsePlacement(value: unknown): Partial<KwtTrophyPlacement> {
  if (!value || typeof value !== "object") return DEFAULT_KWT_TROPHY_PLACEMENT
  return value as Partial<KwtTrophyPlacement>
}
function isPng(bytes: Uint8Array) { return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value) }
function safeNumber(value: unknown) { const n = Number(value); return Number.isInteger(n) ? n : null }

async function canonicalPlayer(client: ReturnType<typeof trustedTournamentClient>, playerId: string) {
  const resolved = await client.rpc("resolve_canonical_player_id", { p_player_id: playerId })
  if (resolved.error) throw resolved.error
  const canonicalId = typeof resolved.data === "string" ? resolved.data : playerId
  const player = await client.from("players").select("id,screen_name,division,status,active").eq("id", canonicalId).maybeSingle()
  if (player.error) throw player.error
  if (!player.data || player.data.active !== true || ["retired", "merged", "archived"].includes(String(player.data.status || "").toLowerCase())) throw new Error("Choose an active canonical Global Player.")
  return player.data
}

async function loadGlobalPlayers(client: ReturnType<typeof trustedTournamentClient>, query: string) {
  const needle = query.trim()
  if (needle.length < 2) return []
  const escaped = needle.replace(/[%,()]/g, " ").trim()
  const result = await client.from("players").select("id,screen_name,division,status,active,discord_name,discord_username").eq("active", true).or(`screen_name.ilike.%${escaped}%,discord_name.ilike.%${escaped}%,discord_username.ilike.%${escaped}%`).order("screen_name").limit(20)
  if (result.error) throw result.error
  const rows = result.data || []
  return rows.filter((row) => !["retired", "merged", "archived"].includes(String(row.status || "").toLowerCase())).map((row) => ({ id: row.id, screen_name: row.screen_name, division: row.division, status: row.status }))
}

async function audit(client: ReturnType<typeof trustedTournamentClient>, entityType: string, entityId: string, action: string, actor: string, afterState: unknown, reason?: string) {
  await client.from("kwt_trophy_audit_log").insert({ entity_type: entityType, entity_id: entityId, action, actor_user_id: actor, after_state: afterState, reason: reason || null })
}

async function batch(client: ReturnType<typeof trustedTournamentClient>, id: string) {
  const result = await client.from("kwt_trophy_batches").select("*").eq("id", id).maybeSingle()
  if (result.error) throw result.error
  if (!result.data) throw new Error("KWT trophy batch was not found")
  return result.data
}

async function template(client: ReturnType<typeof trustedTournamentClient>, id: string) {
  const result = await client.from("kwt_trophy_templates").select("*").eq("id", id).maybeSingle()
  if (result.error) throw result.error
  if (!result.data) throw new Error("KWT trophy template was not found")
  return result.data
}

async function resolveGrossRecipients(client: ReturnType<typeof trustedTournamentClient>, scope: { season_number: number; week_number: number }, placement: number, division: string) {
  const result = await client.from("kwt_operational_results").select("id,player_id,division,overall_placement,division_placement,status,source_reference").eq("season_number", scope.season_number).eq("week_number", scope.week_number).in("status", ["official", "final"])
  if (result.error) throw result.error
  const rows = (result.data || []) as Array<{ id: string; player_id: string; division: string; overall_placement: number; division_placement: number; status: string; source_reference: string | null }>
  const matches = rows.filter((row) => (division === "OVERALL" ? row.overall_placement === placement : row.division === division && row.division_placement === placement))
  const playerIds = [...new Set(matches.map((row) => row.player_id))]
  const players = playerIds.length ? await client.from("players").select("id,screen_name").in("id", playerIds) : { data: [], error: null }
  if (players.error) throw players.error
  const names = new Map((players.data || []).map((row) => [row.id, row.screen_name]))
  return matches.filter((row) => names.get(row.player_id)).map((row) => ({ recipient_player_id: row.player_id, recipient_name_snapshot: names.get(row.player_id) as string, division, placement, source_kind: "kwt_operational_result", source_reference: row.source_reference || row.id }))
}

async function resolveNetRecipients(scope: { season_number: number; week_number: number }, placement: number, division: string) {
  const payload = await loadVerifiedKwtNetPayload()
  if (payload.state !== "AVAILABLE" || !payload.event || payload.event.season !== scope.season_number || payload.event.week !== scope.week_number) return []
  const rows = payload.rows.filter((row) => row.combinedNet !== null)
  const overallRanks = standardCompetitionRanks(rows.map((row) => row.combinedNet as number))
  const overall = new Map(rows.map((row, index) => [row.playerId, overallRanks[index]]))
  const display = buildKwtDisplayRanks(rows.map((row) => ({ playerId: row.playerId, division: row.division, combinedNet: row.combinedNet })))
  return rows.filter((row) => {
    if (division === "OVERALL") return overall.get(row.playerId) === placement
    return row.division === division && display.byDivision.get(division)?.get(row.playerId) === placement
  }).map((row) => ({ recipient_player_id: row.playerId, recipient_name_snapshot: row.screenName, division: division === "OVERALL" ? (row.division || "OVERALL") : division, placement, source_kind: "kwt_net_result", source_reference: row.playerId }))
}

async function loadRecipients(client: ReturnType<typeof trustedTournamentClient>, scope: { season_number: number; week_number: number; award_category: string }, placement: number, division: string) {
  return scope.award_category === "NET" ? resolveNetRecipients(scope, placement, division) : resolveGrossRecipients(client, scope, placement, division)
}

async function loadWinnerQueue(client: ReturnType<typeof trustedTournamentClient>, scope: { season_number: number; week_number: number; course_code: string; award_category: string }) {
  const divisions = ["OVERALL", "ELITE", "PRO", "SEMI-PRO", "AMATEUR", "PROVISIONAL"]
  const recipients = (await Promise.all(divisions.flatMap((division) => [1, 2, 3].map((placement) => loadRecipients(client, scope, placement, division))))).flat()
  const seen = new Set<string>()
  return recipients.filter((recipient) => { const key = `${recipient.recipient_player_id}:${recipient.division}:${recipient.placement}`; if (seen.has(key)) return false; seen.add(key); return true })
}

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const client = trustedTournamentClient()
  try {
    const search = new URL(request.url).searchParams.get("playerSearch")
    if (search !== null) return NextResponse.json({ players: await loadGlobalPlayers(client, search) }, { headers: { "Cache-Control": "no-store" } })
    const params = new URL(request.url).searchParams
    if (params.get("winnerQueue") === "1") {
      const season = safeNumber(params.get("season")), week = safeNumber(params.get("week")), course = String(params.get("course") || "").trim(), awardCategory = String(params.get("awardCategory") || "GROSS").trim().toUpperCase()
      if (!season || !week || !course || !AWARD_CATEGORIES.has(awardCategory)) return jsonError("Season, week, course, and award category are required.")
      const winners = await loadWinnerQueue(client, { season_number: season, week_number: week, course_code: course, award_category: awardCategory })
      return NextResponse.json({ winners: winners.map((winner) => ({ id: winner.recipient_player_id, screen_name: winner.recipient_name_snapshot, division: winner.division, status: "official", placement: winner.placement, source_kind: winner.source_kind, source_reference: winner.source_reference })) }, { headers: { "Cache-Control": "no-store" } })
    }
    const [templates, batches, awards, operationalWeeks, rawWeeks, bucket] = await Promise.all([
      client.from("kwt_trophy_templates").select("id,season_number,week_number,course_code,award_category,award_scope,template_kind,division,placement,template_name,original_storage_path,original_sha256,mime_type,width,height,nameplate,status,created_at,updated_at").order("season_number", { ascending: false }).order("week_number", { ascending: false }),
      client.from("kwt_trophy_batches").select("id,season_number,week_number,course_code,award_category,award_scope,status,source_snapshot,created_at,updated_at").order("updated_at", { ascending: false }),
      client.from("kwt_trophy_awards").select("id,batch_id,template_id,recipient_player_id,recipient_name_snapshot,award_scope,division,placement,source_kind,source_reference,personalized_storage_path,render_metadata,status,approved_at,awarded_at,created_at").order("created_at", { ascending: false }),
      client.from("kwt_operational_results").select("season_number,week_number").order("season_number", { ascending: false }).order("week_number", { ascending: false }),
      client.from("kwt_raw_scores").select("season,week").not("season", "is", null).order("season", { ascending: false }).order("week", { ascending: false }),
      client.storage.getBucket(BUCKET),
    ])
    for (const response of [templates, batches, awards, operationalWeeks, rawWeeks]) if (response.error) throw response.error
    const scopes = new Map<string, { season: number; week: number }>()
    for (const row of [...(operationalWeeks.data || []).map((r) => ({ season: r.season_number, week: r.week_number })), ...(rawWeeks.data || []).map((r) => ({ season: r.season, week: r.week }))]) if (Number.isInteger(row.season) && Number.isInteger(row.week)) scopes.set(`${row.season}-${row.week}`, row as { season: number; week: number })
    return NextResponse.json({ templates: templates.data || [], batches: batches.data || [], awards: awards.data || [], scopes: [...scopes.values()], storageReady: !bucket.error }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return jsonError(error instanceof Error ? error.message : "KWT trophy manager is unavailable.", 503) }
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const client = trustedTournamentClient()
  const contentType = request.headers.get("content-type") || ""
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData()
      const action = String(form.get("action") || "")
      const file = form.get("file")
      if (!["preview", "upload_template", "attach_historical"].includes(action)) return jsonError("Unknown trophy file action")
      if (!(file instanceof File) || file.type !== "image/png" || file.size < 1 || file.size > MAX_BYTES) return jsonError("Choose a PNG trophy image no larger than 12 MB.")
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (!isPng(bytes)) return jsonError("The selected file is not a valid PNG.")
      const placement = parsePlacement(JSON.parse(String(form.get("placement") || "{}")))
      const selectedPlayer = String(form.get("playerId") || "").trim()
      const winner = selectedPlayer ? await canonicalPlayer(client, selectedPlayer) : null
      const winnerName = winner?.screen_name || "Preview Player"
      if (action === "preview" && !winner) return jsonError("Select a canonical Global Player before rendering a preview.")
      if (action === "attach_historical" && !winner) return jsonError("Select the canonical Global Player attached to this historical trophy.")
      const rendered = await renderKwtPersonalizedTrophy(bytes, winnerName, placement)
      if (action === "preview") return NextResponse.json({ preview: `data:image/png;base64,${Buffer.from(rendered.bytes).toString("base64")}`, width: rendered.width, height: rendered.height, placement: rendered.placement, sha256: sha256(bytes) })
      const season = safeNumber(form.get("season")); const week = safeNumber(form.get("week")); const placementNumber = safeNumber(form.get("placementNumber"))
      const course = String(form.get("course") || "").trim(); const awardCategory = String(form.get("awardCategory") || "").trim().toUpperCase(); const division = String(form.get("division") || "OVERALL").trim().toUpperCase(); const name = String(form.get("templateName") || file.name).trim()
      if (!season || !week || !placementNumber || !course || !AWARD_CATEGORIES.has(awardCategory) || !name) return jsonError("Season, week, course, award category, placement, and template name are required.")
      const awardScope = String(form.get("awardScope") || (division === "OVERALL" ? "overall" : "division")).trim().toLowerCase()
      const templateKind = String(form.get("templateKind") || "individual").trim().toLowerCase()
      if (!AWARD_SCOPES.has(awardScope) || !TEMPLATE_KINDS.has(templateKind)) return jsonError("The award scope or template kind is invalid.")
      const existing = await client.from("kwt_trophy_templates").select("id").eq("season_number", season).eq("week_number", week).eq("course_code", course).eq("award_category", awardCategory).eq("division", division).eq("placement", placementNumber).maybeSingle()
      if (existing.error) throw existing.error
      if (existing.data) return jsonError("A trophy template already exists for this award slot. Archive it before replacing it.", 409)
      const meta = await inspectPng(bytes)
      const originalPath = `kwt/templates/${crypto.randomUUID()}.png`
      const upload = await client.storage.from(BUCKET).upload(originalPath, bytes, { contentType: "image/png", cacheControl: "31536000", upsert: false })
      if (upload.error) throw upload.error
      const inserted = await client.from("kwt_trophy_templates").insert({ season_number: season, week_number: week, course_code: course, award_category: awardCategory, award_scope: action === "attach_historical" ? "historical" : awardScope, template_kind: action === "attach_historical" ? "historical_personalized" : templateKind, division, placement: placementNumber, template_name: name, original_storage_path: originalPath, original_sha256: sha256(bytes), mime_type: "image/png", width: meta.width, height: meta.height, nameplate: rendered.placement, created_by: authorization.user.id }).select("*").single()
      if (inserted.error) { await client.storage.from(BUCKET).remove([originalPath]); throw inserted.error }
      await audit(client, "template", inserted.data.id, "created", authorization.user.id, inserted.data)
      if (action === "attach_historical") {
        if (!winner) return jsonError("Select the canonical Global Player attached to this historical trophy.")
        const historicalBatch = await client.from("kwt_trophy_batches").upsert({ season_number: season, week_number: week, course_code: course, award_category: awardCategory, award_scope: "historical", created_by: authorization.user.id }, { onConflict: "season_number,week_number,course_code,award_category" }).select("*").single()
        if (historicalBatch.error) throw historicalBatch.error
        const award = await client.from("kwt_trophy_awards").insert({ batch_id: historicalBatch.data.id, template_id: inserted.data.id, recipient_player_id: winner.id, recipient_name_snapshot: winner.screen_name, division, placement: placementNumber, award_scope: "historical", source_kind: "historical_evidence", source_reference: String(form.get("sourceReference") || "admin-supplied historical evidence"), personalized_storage_path: originalPath, render_sha256: sha256(bytes), render_metadata: { historicalOriginal: true, width: meta.width, height: meta.height }, status: "personalized", created_by: authorization.user.id }).select("*").single()
        if (award.error) throw award.error
        await audit(client, "award", award.data.id, "historical_attached", authorization.user.id, award.data)
        return NextResponse.json({ template: inserted.data, award: award.data }, { status: 201 })
      }
      return NextResponse.json({ template: inserted.data }, { status: 201 })
    }

    const body = await request.json() as Record<string, unknown>
    const action = String(body.action || "")
    if (action === "create_batch") {
      const season = safeNumber(body.season); const week = safeNumber(body.week); const course = String(body.course || "").trim(); const awardCategory = String(body.awardCategory || "").trim().toUpperCase()
      if (!season || !week || !course || !AWARD_CATEGORIES.has(awardCategory)) return jsonError("Season, week, course, and award category are required.")
      const awardScope = String(body.awardScope || "division").trim().toLowerCase()
      if (!AWARD_SCOPES.has(awardScope)) return jsonError("The award scope is invalid.")
      const existing = await client.from("kwt_trophy_batches").select("*").eq("season_number", season).eq("week_number", week).eq("course_code", course).eq("award_category", awardCategory).maybeSingle()
      if (existing.error) throw existing.error
      if (existing.data) return NextResponse.json({ batch: existing.data })
      const inserted = await client.from("kwt_trophy_batches").insert({ season_number: season, week_number: week, course_code: course, award_category: awardCategory, award_scope: awardScope, created_by: authorization.user.id }).select("*").single()
      if (inserted.error) throw inserted.error
      await audit(client, "batch", inserted.data.id, "created", authorization.user.id, inserted.data)
      return NextResponse.json({ batch: inserted.data }, { status: 201 })
    }
    if (action === "prepare_candidate") {
      const templateRow = await template(client, String(body.templateId || ""))
      if (templateRow.status !== "active") return jsonError("Only an active trophy template can prepare a candidate.", 409)
      if (templateRow.template_kind === "historical_personalized") return jsonError("Historical personalized trophies use the attached recipient workflow.", 409)
      const recipient = await canonicalPlayer(client, String(body.playerId || ""))
      const existingBatch = await client.from("kwt_trophy_batches").select("*").eq("season_number", templateRow.season_number).eq("week_number", templateRow.week_number).eq("course_code", templateRow.course_code).eq("award_category", templateRow.award_category).maybeSingle()
      if (existingBatch.error) throw existingBatch.error
      let batchRow = existingBatch.data
      if (!batchRow) {
        const createdBatch = await client.from("kwt_trophy_batches").insert({ season_number: templateRow.season_number, week_number: templateRow.week_number, course_code: templateRow.course_code, award_category: templateRow.award_category, award_scope: templateRow.award_scope || "division", created_by: authorization.user.id }).select("*").single()
        if (createdBatch.error) throw createdBatch.error
        batchRow = createdBatch.data
        await audit(client, "batch", batchRow.id, "created_for_candidate", authorization.user.id, batchRow)
      }
      const existingAward = await client.from("kwt_trophy_awards").select("*").eq("batch_id", batchRow.id).eq("template_id", templateRow.id).eq("recipient_player_id", recipient.id).maybeSingle()
      if (existingAward.error) throw existingAward.error
      if (existingAward.data) return NextResponse.json({ batch: batchRow, award: existingAward.data, created: false })
      const inserted = await client.from("kwt_trophy_awards").insert({ batch_id: batchRow.id, template_id: templateRow.id, recipient_player_id: recipient.id, recipient_name_snapshot: recipient.screen_name, award_scope: templateRow.award_scope || batchRow.award_scope || "division", division: templateRow.division, placement: templateRow.placement, source_kind: "manual_review", source_reference: `admin-selected:${templateRow.id}:${recipient.id}`, status: "candidate", created_by: authorization.user.id }).select("*").single()
      if (inserted.error) throw inserted.error
      await audit(client, "award", inserted.data.id, "candidate_prepared", authorization.user.id, inserted.data, "Admin selected a canonical Global Player; no award was approved or published.")
      return NextResponse.json({ batch: batchRow, award: inserted.data, created: true }, { status: 201 })
    }
    if (action === "resolve_recipients") {
      const batchRow = await batch(client, String(body.batchId || ""))
      const templates = await client.from("kwt_trophy_templates").select("id,division,placement,award_scope,template_kind").eq("season_number", batchRow.season_number).eq("week_number", batchRow.week_number).eq("course_code", batchRow.course_code).eq("award_category", batchRow.award_category).eq("status", "active")
      if (templates.error) throw templates.error
      const created: unknown[] = []
      for (const template of templates.data || []) {
        const recipients = await loadRecipients(client, batchRow, template.placement, template.division)
        for (const recipient of recipients) {
          const existing = await client.from("kwt_trophy_awards").select("id").eq("batch_id", batchRow.id).eq("template_id", template.id).eq("recipient_player_id", recipient.recipient_player_id).maybeSingle()
          if (existing.error) throw existing.error
          if (existing.data) continue
          const inserted = await client.from("kwt_trophy_awards").insert({ batch_id: batchRow.id, template_id: template.id, award_scope: template.award_scope || batchRow.award_scope || "division", ...recipient, created_by: authorization.user.id }).select("*").single()
          if (inserted.error) throw inserted.error
          created.push(inserted.data)
        }
      }
      const snapshot = { ...(batchRow.source_snapshot || {}), resolvedAt: new Date().toISOString(), resultsFinal: false, createdCount: created.length }
      await client.from("kwt_trophy_batches").update({ status: "recipients_verified", source_snapshot: snapshot, updated_at: new Date().toISOString() }).eq("id", batchRow.id)
      await audit(client, "batch", batchRow.id, "recipients_resolved", authorization.user.id, snapshot)
      return NextResponse.json({ batchId: batchRow.id, createdCount: created.length, awards: created })
    }
    if (action === "mark_final") {
      const batchRow = await batch(client, String(body.batchId || ""))
      const snapshot = { ...(batchRow.source_snapshot || {}), resultsFinal: true, resultsFinalAt: new Date().toISOString(), resultsFinalReason: String(body.reason || "Admin verified the source standings.").trim() }
      const updated = await client.from("kwt_trophy_batches").update({ source_snapshot: snapshot, updated_at: new Date().toISOString() }).eq("id", batchRow.id).select("*").single()
      if (updated.error) throw updated.error
      await audit(client, "batch", batchRow.id, "results_marked_final", authorization.user.id, snapshot, snapshot.resultsFinalReason)
      return NextResponse.json({ batch: updated.data })
    }
    if (action === "render_batch") {
      const batchRow = await batch(client, String(body.batchId || ""))
      const awards = await client.from("kwt_trophy_awards").select("*,kwt_trophy_templates(original_storage_path,nameplate,template_kind)").eq("batch_id", batchRow.id).in("status", ["candidate", "personalized"])
      if (awards.error) throw awards.error
      const rendered: unknown[] = []
      for (const award of awards.data || []) {
        const template = (award as { kwt_trophy_templates?: { original_storage_path: string; nameplate: KwtTrophyPlacement; template_kind?: string } }).kwt_trophy_templates
        if (!template) continue
        let path = award.personalized_storage_path as string | null
        let renderData: Record<string, unknown> = {}
        if (template.template_kind !== "historical_personalized") {
          const original = await client.storage.from(BUCKET).download(template.original_storage_path)
          if (original.error) throw original.error
          const source = new Uint8Array(await original.data.arrayBuffer())
          const output = await renderKwtPersonalizedTrophy(source, award.recipient_name_snapshot, template.nameplate)
          path = `kwt/rendered/${award.id}.png`
          const upload = await client.storage.from(BUCKET).upload(path, output.bytes, { contentType: "image/png", cacheControl: "31536000", upsert: true })
          if (upload.error) throw upload.error
          renderData = { width: output.width, height: output.height, placement: output.placement }
          const updated = await client.from("kwt_trophy_awards").update({ personalized_storage_path: path, render_sha256: sha256(output.bytes), render_metadata: renderData, status: "personalized", updated_at: new Date().toISOString() }).eq("id", award.id).select("*").single()
          if (updated.error) throw updated.error
          rendered.push(updated.data)
          continue
        }
        if (!path) throw new Error("Historical trophy is missing its preserved source image.")
        const updated = await client.from("kwt_trophy_awards").update({ status: "personalized", updated_at: new Date().toISOString() }).eq("id", award.id).select("*").single()
        if (updated.error) throw updated.error
        rendered.push(updated.data)
      }
      await client.from("kwt_trophy_batches").update({ status: "personalized_preview", updated_at: new Date().toISOString() }).eq("id", batchRow.id)
      await audit(client, "batch", batchRow.id, "batch_rendered", authorization.user.id, { count: rendered.length })
      return NextResponse.json({ renderedCount: rendered.length, awards: rendered })
    }
    if (action === "approve_award" || action === "award") {
      const awardId = String(body.awardId || "")
      const award = await client.from("kwt_trophy_awards").select("id,batch_id,status,recipient_player_id,recipient_name_snapshot,division,placement,personalized_storage_path,award_scope,source_kind,source_reference").eq("id", awardId).maybeSingle()
      if (award.error) throw award.error
      if (!award.data) return jsonError("Award was not found.", 404)
      const batchRow = await batch(client, award.data.batch_id)
      if (batchRow.source_snapshot?.resultsFinal !== true) return jsonError("Source results must be explicitly verified final before an award can be approved.", 409)
      const allowed = action === "approve_award" ? award.data.status === "personalized" : award.data.status === "approved"
      if (!allowed) return jsonError("This award is not in the required review state.", 409)
      if (action === "award" && !award.data.personalized_storage_path) return jsonError("A personalized trophy image is required before publication.", 409)
      const nextStatus = action === "approve_award" ? "approved" : "awarded"
      let profileTrophyId: string | null = null
      if (action === "award") {
        const recipient = await canonicalPlayer(client, award.data.recipient_player_id)
        const placementLabel = award.data.award_scope === "overall" ? "Overall Winner" : `${award.data.placement}${award.data.placement === 1 ? "st" : award.data.placement === 2 ? "nd" : "rd"}`
        const profile = await client.from("player_trophies").upsert({
          player_id: recipient.id,
          player_name: recipient.screen_name,
          event_type: "KWT",
          event_name: `KWT Season ${batchRow.season_number} Week ${batchRow.week_number} · ${batchRow.course_code}`,
          league_type: "kwt",
          division: award.data.division,
          placement: placementLabel,
          season: String(batchRow.season_number),
          week: String(batchRow.week_number),
          trophy_title: `${batchRow.award_category} ${placementLabel}`,
          image_url: `/api/trophies/kwt-awards/${awardId}/image`,
          notes: `Verified KWT ${batchRow.award_category} award. Source: ${award.data.source_kind}${award.data.source_reference ? ` (${award.data.source_reference})` : ""}.`,
          source_key: `kwt-award:${awardId}`,
          kwt_award_id: awardId,
        }, { onConflict: "kwt_award_id" }).select("id").single()
        if (profile.error) throw profile.error
        profileTrophyId = profile.data.id
      }
      const update = await client.from("kwt_trophy_awards").update(action === "approve_award" ? { status: nextStatus, approved_by: authorization.user.id, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() } : { status: nextStatus, awarded_at: new Date().toISOString(), profile_trophy_id: profileTrophyId, updated_at: new Date().toISOString() }).eq("id", awardId).select("*").single()
      if (update.error) throw update.error
      await audit(client, "award", awardId, nextStatus, authorization.user.id, update.data)
      return NextResponse.json({ award: update.data })
    }
    return jsonError("Unknown KWT trophy-manager action")
  } catch (error) {
    const detail = error as { code?: string; message?: string } | null
    return jsonError(detail?.message || "KWT Trophy Manager operation failed.", detail?.code === "23505" ? 409 : 503)
  }
}
