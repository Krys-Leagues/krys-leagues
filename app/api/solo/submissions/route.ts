import { createHash, randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { createScorecardServiceClient } from "@/lib/scorecards/server"
import { isSupportedScorecardEvidence, safeScorecardEvidenceFilename } from "@/lib/scorecards/core"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { resolveSoloPlayer } from "@/lib/soloSubmissionServer"

export const runtime = "nodejs"
const bucket = "shared-scorecard-evidence"

export async function POST(request: Request) {
  const session = await createServerSupabaseClient()
  const userResult = await session.auth.getUser()
  if (userResult.error || !userResult.data.user) return NextResponse.json({ error: "Sign in with Discord to submit a Solo card." }, { status: 401 })
  const service = createScorecardServiceClient()
  const identity = await resolveSoloPlayer(service, userResult.data.user)
  if (identity.status !== "resolved") return NextResponse.json({ error: "You are not eligible for the active Solo season." }, { status: 403 })
  const form = await request.formData()
  const difficulty = String(form.get("difficulty") || "").toLowerCase()
  const intent = String(form.get("intent") || "").toLowerCase()
  const scoreRaw = String(form.get("score") || "").trim()
  const hn1Raw = String(form.get("hn1") || "").trim()
  const file = form.get("file")
  if (!["easy", "hard"].includes(difficulty) || !["score", "ace"].includes(intent) || !(file instanceof File)) return NextResponse.json({ error: "Difficulty, submission intent, and a scorecard photo are required." }, { status: 400 })
  const hn1 = Number(hn1Raw)
  const score = scoreRaw === "" ? null : Number(scoreRaw)
  if (!Number.isInteger(hn1) || hn1 < 0 || (intent === "score" && !Number.isInteger(score)) || (score !== null && !Number.isInteger(score))) return NextResponse.json({ error: "Enter a valid score and non-negative HN1 count." }, { status: 400 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isSupportedScorecardEvidence(file.type, bytes.byteLength)) return NextResponse.json({ error: "Upload a supported scorecard image." }, { status: 400 })
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const duplicate = await service.from("solo_submissions").select("id,status").eq("player_id", identity.playerId).eq("week_id", identity.week.id).eq("difficulty", difficulty).eq("evidence_sha256", sha256).limit(1).maybeSingle()
  if (duplicate.error) return NextResponse.json({ error: "Duplicate check failed." }, { status: 503 })
  if (duplicate.data) return NextResponse.json({ error: "This scorecard has already been submitted." }, { status: 409 })
  const id = randomUUID()
  const path = `solo/${identity.season.id}/${identity.week.id}/${identity.playerId}/${id}-${safeScorecardEvidenceFilename(file.name, file.type)}`
  const upload = await service.storage.from(bucket).upload(path, bytes, { contentType: file.type.toLowerCase(), cacheControl: "3600", upsert: false })
  if (upload.error) return NextResponse.json({ error: "Private scorecard storage failed." }, { status: 503 })
  const insert = await service.from("solo_submissions").insert({ id, season_id: identity.season.id, week_id: identity.week.id, player_id: identity.playerId, difficulty, submission_intent: intent, stroke_score: score, hn1_count: hn1, evidence_storage_path: path, original_filename: file.name.slice(0, 255), content_type: file.type.toLowerCase(), evidence_sha256: sha256, status: "provisional" }).select("id,status").single()
  if (insert.error) { await service.storage.from(bucket).remove([path]); return NextResponse.json({ error: insert.error.message }, { status: 400 }) }
  return NextResponse.json({ id: insert.data.id, status: insert.data.status, message: "SOLO CARD SUBMITTED — PROVISIONAL" }, { status: 201 })
}
