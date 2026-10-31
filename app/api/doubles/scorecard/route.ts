import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { authorizeDoublesParticipant, createDoublesRuntimeClient } from "@/lib/doublesParticipantServer"
import { buildDoublesScorecardCommit, scorecardCommitKey } from "@/lib/doublesScorecard"

const componentKeys = new Set(["course1", "course2"])

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    const form = await request.formData()
    const fixtureId = String(form.get("fixture_id") || "")
    const componentKey = String(form.get("component_key") || "") as "course1" | "course2"
    const evidenceId = String(form.get("evidence_id") || "")
    const file = form.get("file")
    if (!fixtureId || !componentKeys.has(componentKey) || !evidenceId || !(file instanceof File)) return NextResponse.json({ error: "Fixture, component, evidence and image are required" }, { status: 400 })
    const authorization = await authorizeDoublesParticipant(fixtureId)
    if (!authorization.authorized) return NextResponse.json({ error: authorization.message }, { status: authorization.status })
    const reserved = await authorization.client.from("doubles_scorecard_components").select("id,evidence_storage_path,status").eq("id", evidenceId).eq("fixture_id", fixtureId).eq("component_key", componentKey).eq("uploader_player_id", authorization.participantId).eq("status", "RESERVED").maybeSingle()
    if (reserved.error || !reserved.data) return NextResponse.json({ error: "Reserved private evidence was not found" }, { status: 409 })
    const upload = await authorization.client.storage.from("doubles-scorecard-evidence").upload(reserved.data.evidence_storage_path, file, { contentType: file.type || "application/octet-stream", upsert: false })
    if (upload.error) return NextResponse.json({ error: "Private evidence upload failed; reservation remains recoverable" }, { status: 503 })
    const received = await authorization.client.from("doubles_scorecard_components").update({ status: "RECEIVED", original_filename: file.name, content_type: file.type || "application/octet-stream" }).eq("id", evidenceId).select("id,fixture_id,component_key,course,status,original_filename,content_type,created_at").single()
    if (received.error) return NextResponse.json({ error: "Evidence was uploaded but review state could not be recorded" }, { status: 503 })
    return NextResponse.json({ component: received.data })
  }
  let body: { action?: string; fixture_id?: string; component_key?: "course1" | "course2"; original_filename?: string; content_type?: string; card_date_text?: string; home_strokes?: number[]; away_strokes?: number[] }
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid scorecard request" }, { status: 400 }) }
  if (!body.fixture_id || !body.component_key || !componentKeys.has(body.component_key)) return NextResponse.json({ error: "Exact fixture and course component are required" }, { status: 400 })

  if (body.action === "reserve") {
    const authorization = await authorizeDoublesParticipant(body.fixture_id)
    if (!authorization.authorized) return NextResponse.json({ error: authorization.message }, { status: authorization.status })
    const existing = await authorization.client.from("doubles_scorecard_components").select("id,status").eq("fixture_id", body.fixture_id).eq("component_key", body.component_key).maybeSingle()
    if (existing.error) return NextResponse.json({ error: "Scorecard component is unavailable" }, { status: 503 })
    if (existing.data && ["RESERVED", "RECEIVED", "IN_REVIEW", "VERIFIED"].includes(existing.data.status)) return NextResponse.json({ error: "This course already has an active scorecard submission" }, { status: 409 })
    const course = body.component_key === "course1" ? authorization.fixture.home_course : authorization.fixture.away_course
    const row = await authorization.client.from("doubles_scorecard_components").insert({ fixture_id: body.fixture_id, component_key: body.component_key, course, uploader_player_id: authorization.participantId, evidence_storage_path: `doubles/${body.fixture_id}/${body.component_key}/${randomUUID()}`, original_filename: body.original_filename?.trim() || "scorecard", content_type: body.content_type?.trim() || "image/*", status: "RESERVED", card_date_text: body.card_date_text?.trim() || null }).select("id,fixture_id,component_key,course,status,original_filename,content_type,created_at").single()
    if (row.error) return NextResponse.json({ error: "Scorecard evidence could not be reserved" }, { status: 503 })
    return NextResponse.json({ component: row.data }, { status: 201 })
  }

  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const client = createDoublesRuntimeClient()
  if (body.action === "verify") {
    if (!Array.isArray(body.home_strokes) || !Array.isArray(body.away_strokes) || body.home_strokes.length !== 18 || body.away_strokes.length !== 18 || body.home_strokes.some((value) => !Number.isInteger(value) || value < 0) || body.away_strokes.some((value) => !Number.isInteger(value) || value < 0)) return NextResponse.json({ error: "Both teams require exactly 18 non-negative hole values" }, { status: 400 })
    const updated = await client.from("doubles_scorecard_components").update({ status: "VERIFIED", home_strokes: body.home_strokes, away_strokes: body.away_strokes, reviewed_by: (await authorization.supabase.auth.getUser()).data.user?.id || null, reviewed_at: new Date().toISOString(), revision: 1 }).eq("fixture_id", body.fixture_id).eq("component_key", body.component_key).in("status", ["RESERVED", "RECEIVED", "IN_REVIEW"]).select("id,fixture_id,component_key,course,status,home_strokes,away_strokes").maybeSingle()
    if (updated.error || !updated.data) return NextResponse.json({ error: "Scorecard component was not found or is already finalized" }, { status: 409 })
    return NextResponse.json({ component: updated.data })
  }
  if (body.action === "commit") {
    const components = await client.from("doubles_scorecard_components").select("component_key,home_strokes,away_strokes,uploader_player_id,id").eq("fixture_id", body.fixture_id).eq("status", "VERIFIED")
    if (components.error || components.data?.length !== 2) return NextResponse.json({ error: "Both course components must be verified before commit" }, { status: 409 })
    const normalized = components.data.map((row) => ({ key: row.component_key as "course1" | "course2", homeStrokes: row.home_strokes as number[], awayStrokes: row.away_strokes as number[], verified: true, evidenceId: row.id, uploaderPlayerId: row.uploader_player_id }))
    const commit = buildDoublesScorecardCommit(normalized)
    const first = components.data.find((row) => row.component_key === "course1")
    const second = components.data.find((row) => row.component_key === "course2")
    const key = scorecardCommitKey(body.fixture_id, first?.id || "", second?.id || "")
    const existing = await client.from("doubles_scorecard_commits").select("status,result_id").eq("fixture_id", body.fixture_id).maybeSingle()
    if (existing.data?.status === "COMMITTED") return NextResponse.json({ committed: true, result_id: existing.data.result_id, idempotent: true })
    await client.from("doubles_scorecard_commits").upsert({ fixture_id: body.fixture_id, idempotency_key: key, status: "PENDING" }, { onConflict: "fixture_id" })
    const saved = await authorization.supabase.rpc("save_doubles_managed_result", { p_fixture_id: body.fixture_id, p_home_score: commit.home_score, p_away_score: commit.away_score })
    if (saved.error) { await client.from("doubles_scorecard_commits").update({ status: "FAILED", error_message: saved.error.message }).eq("fixture_id", body.fixture_id); return NextResponse.json({ error: saved.error.message }, { status: 400 }) }
    const fixture = await client.from("doubles_managed_fixtures").select("season_id,division").eq("id", body.fixture_id).single()
    if (fixture.error) return NextResponse.json({ error: "Fixture context is unavailable" }, { status: 503 })
    const rebuilt = await authorization.supabase.rpc("rebuild_doubles_managed_standings", { p_season_id: fixture.data.season_id, p_division: fixture.data.division })
    if (rebuilt.error) return NextResponse.json({ error: rebuilt.error.message }, { status: 500 })
    await client.from("doubles_scorecard_commits").update({ status: "COMMITTED", result_id: saved.data, committed_at: new Date().toISOString(), error_message: null }).eq("fixture_id", body.fixture_id)
    return NextResponse.json({ committed: true, result_id: saved.data, home_score: commit.home_score, away_score: commit.away_score, standings_saved: rebuilt.data })
  }
  return NextResponse.json({ error: "Unsupported scorecard action" }, { status: 400 })
}
