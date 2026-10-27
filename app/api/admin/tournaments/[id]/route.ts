import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { isMissingTournamentSchema, trustedTournamentClient } from "@/lib/tournaments/server"

export const dynamic = "force-dynamic"

function text(value: unknown) { return typeof value === "string" ? value.trim() : "" }

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const { id } = await context.params
  const response = await fetch(new URL(`/api/admin/tournaments?tournamentId=${encodeURIComponent(id)}`, _request.url), { headers: { cookie: _request.headers.get("cookie") || "" }, cache: "no-store" })
  return new NextResponse(response.body, { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } })
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const { id } = await context.params
  const body = await request.json().catch(() => null) as { action?: unknown; reason?: unknown; impactSummary?: unknown; newRules?: unknown; name?: unknown; definition?: unknown; matchId?: unknown; advancingPlayerId?: unknown; affectedMatchIds?: unknown; forfeitRequestId?: unknown; decision?: unknown; winnerPlayerId?: unknown; scoreLabel?: unknown; evidenceReference?: unknown; idempotencyKey?: unknown; playerId?: unknown; playerTimezone?: unknown; playerOrder?: unknown } | null
  if (!body) return NextResponse.json({ error: "A JSON control request is required." }, { status: 400 })
  const action = text(body?.action)
  const client = trustedTournamentClient()

  if (action === "manual_add_registration") {
    if (!text(body?.playerId) || !text(body?.playerTimezone) || !text(body?.reason)) return NextResponse.json({ error: "Canonical player, IANA time zone, and written reason are required." }, { status: 400 })
    const { data, error } = await authorization.supabase.rpc("admin_add_tournament_registration", { p_tournament_id: id, p_player_id: text(body.playerId), p_player_timezone: text(body.playerTimezone), p_reason: text(body.reason) })
    if (error) return NextResponse.json({ error: isMissingTournamentSchema(error) ? "Self-registration follow-up schema is not installed in this environment." : error.message }, { status: isMissingTournamentSchema(error) ? 503 : 400 })
    return NextResponse.json({ registration: data }, { status: 201 })
  }

  if (action === "seed_bracket") {
    if (!Array.isArray(body?.playerOrder)) return NextResponse.json({ error: "Provide the confirmed registration order before seeding." }, { status: 400 })
    const { data, error } = await authorization.supabase.rpc("admin_seed_tournament", { p_tournament_id: id, p_player_order: body.playerOrder })
    if (error) return NextResponse.json({ error: isMissingTournamentSchema(error) ? "Self-registration follow-up schema is not installed in this environment." : error.message }, { status: isMissingTournamentSchema(error) ? 503 : 400 })
    return NextResponse.json({ result: data })
  }

  if (action === "create_scorecard_template") {
    if (!text(body?.name) || !body?.definition || typeof body.definition !== "object") return NextResponse.json({ error: "A scorecard name and definition are required." }, { status: 400 })
    const { data, error } = await client.from("tournament_scorecard_templates").insert({ tournament_id: id, name: text(body.name), definition: body.definition, created_by: authorization.user.id }).select("id,name,created_at").single()
    if (error) return NextResponse.json({ error: isMissingTournamentSchema(error) ? "Tournament Builder schema is not installed in this environment." : error.message }, { status: 503 })
    return NextResponse.json({ template: data }, { status: 201 })
  }

  if (action === "change_rules") {
    if (!body?.newRules || typeof body.newRules !== "object" || !text(body?.reason) || !text(body?.impactSummary)) return NextResponse.json({ error: "A new rules object, written reason, and impact summary are required." }, { status: 400 })
    const { data: tournament, error: readError } = await client.from("tournaments").select("rules,version,status").eq("id", id).maybeSingle()
    if (readError || !tournament) return NextResponse.json({ error: readError?.message || "Tournament was not found." }, { status: 404 })
    if (tournament.status === "completed" || tournament.status === "archived") return NextResponse.json({ error: "Completed and archived tournaments are immutable." }, { status: 409 })
    const nextVersion = Number(tournament.version || 1) + 1
    const { error } = await client.from("tournament_rule_changes").insert({ tournament_id: id, version: nextVersion, old_rules: tournament.rules, new_rules: body.newRules, impact_summary: text(body.impactSummary), reason: text(body.reason), changed_by: authorization.user.id })
    if (error) return NextResponse.json({ error: error.message }, { status: 503 })
    const { error: updateError } = await client.from("tournaments").update({ rules: body.newRules, version: nextVersion, updated_at: new Date().toISOString() }).eq("id", id)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 503 })
    await client.from("tournament_audit_log").insert({ tournament_id: id, action: "rules_changed", details: { version: nextVersion, impact_summary: text(body.impactSummary), reason: text(body.reason) }, actor_id: authorization.user.id })
    return NextResponse.json({ version: nextVersion })
  }

  if (action === "force_advance") {
    if (!text(body?.matchId) || !text(body?.advancingPlayerId) || !text(body?.reason)) return NextResponse.json({ error: "Match, advancing player, and written reason are required." }, { status: 400 })
    const { data, error } = await authorization.supabase.rpc("admin_force_tournament_advance", { p_tournament_id: id, p_match_id: text(body.matchId), p_advancing_player_id: text(body.advancingPlayerId), p_reason: text(body.reason) })
    if (error) return NextResponse.json({ error: isMissingTournamentSchema(error) ? "Tournament Builder schema is not installed in this environment." : error.message }, { status: 503 })
    return NextResponse.json(data)
  }

  if (action === "record_result") {
    if (!text(body?.matchId) || !text(body?.winnerPlayerId) || !text(body?.scoreLabel) || !text(body?.evidenceReference) || !text(body?.idempotencyKey)) return NextResponse.json({ error: "Match, winner, score, evidence reference, and idempotency key are required." }, { status: 400 })
    const { data, error } = await authorization.supabase.rpc("admin_record_tournament_match_result", {
      p_match_id: text(body.matchId), p_winner_player_id: text(body.winnerPlayerId), p_score_label: text(body.scoreLabel), p_evidence_reference: text(body.evidenceReference), p_idempotency_key: text(body.idempotencyKey),
    })
    if (error) return NextResponse.json({ error: isMissingTournamentSchema(error) ? "Tournament Builder schema is not installed in this environment." : error.message }, { status: isMissingTournamentSchema(error) ? 503 : 400 })
    return NextResponse.json({ result: data })
  }

  if (action === "rewind") {
    if (!text(body?.matchId) || !text(body?.reason) || !Array.isArray(body?.affectedMatchIds)) return NextResponse.json({ error: "Match, affected matches, and written reason are required." }, { status: 400 })
    const { data, error } = await authorization.supabase.rpc("admin_record_tournament_rewind", { p_tournament_id: id, p_match_id: text(body.matchId), p_reason: text(body.reason), p_affected_match_ids: body.affectedMatchIds })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ rewindId: data, status: "recorded_for_review" }, { status: 202 })
  }

  if (action === "decide_forfeit") {
    if (!text(body?.forfeitRequestId) || !["approved", "denied"].includes(text(body?.decision)) || !text(body?.reason)) return NextResponse.json({ error: "Forfeit request, decision, and written reason are required." }, { status: 400 })
    const client = trustedTournamentClient()
    const { data: requestRow, error: readError } = await client.from("tournament_forfeit_requests").select("id,match_id,status").eq("id", text(body.forfeitRequestId)).maybeSingle()
    if (readError || !requestRow) return NextResponse.json({ error: readError?.message || "Forfeit request was not found." }, { status: 404 })
    if (requestRow.status !== "pending") return NextResponse.json({ error: "This forfeit request already has a decision." }, { status: 409 })
    const { error } = await client.from("tournament_forfeit_requests").update({ status: text(body.decision), decided_by: authorization.user.id, decision_reason: text(body.reason), decided_at: new Date().toISOString() }).eq("id", requestRow.id).eq("status", "pending")
    if (error) return NextResponse.json({ error: error.message }, { status: 503 })
    await client.from("tournament_audit_log").insert({ tournament_id: id, action: "forfeit_decided", details: { request_id: requestRow.id, decision: text(body.decision), reason: text(body.reason) }, actor_id: authorization.user.id })
    return NextResponse.json({ status: text(body.decision) })
  }

  return NextResponse.json({ error: "Unsupported tournament control action." }, { status: 400 })
}

