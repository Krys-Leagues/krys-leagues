import { createHash, randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { calculateScorecardTotals, isSupportedScorecardEvidence, safeScorecardEvidenceFilename, type ScorecardHoleInput } from "@/lib/scorecards/core"
import { createScorecardServiceClient, resolveCanonicalSessionPlayer } from "@/lib/scorecards/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
const bucket = "shared-scorecard-evidence"

export async function GET() {
  const session = await createServerSupabaseClient()
  const userResult = await session.auth.getUser()
  if (userResult.error || !userResult.data.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 })
  const service = createScorecardServiceClient()
  const identity = await resolveCanonicalSessionPlayer(service, userResult.data.user)
  if (identity.status !== "resolved") return NextResponse.json({ error: "A canonical Krys Leagues player identity is required." }, { status: 403 })
  const result = await service.from("all_time_player_submissions").select("id,score,status,submitted_at,reviewed_at,rejection_reason,course:all_time_courses(base_map,display_name,difficulty)").eq("player_id", identity.playerId).order("submitted_at", { ascending: false })
  if (result.error) return NextResponse.json({ error: "Submission history could not be loaded." }, { status: 503 })
  return NextResponse.json({ playerId: identity.playerId, submissions: result.data || [] }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const session = await createServerSupabaseClient()
  const userResult = await session.auth.getUser()
  if (userResult.error || !userResult.data.user) return NextResponse.json({ error: "Sign in with Discord to submit an All-Time scorecard." }, { status: 401 })
  const service = createScorecardServiceClient()
  const identity = await resolveCanonicalSessionPlayer(service, userResult.data.user)
  if (identity.status !== "resolved") return NextResponse.json({ error: "A canonical Krys Leagues player identity is required." }, { status: 403 })

  const form = await request.formData()
  const courseId = String(form.get("course_id") || "").trim()
  const holesRaw = String(form.get("hole_strokes") || "")
  const scoreRaw = String(form.get("score") || "").trim()
  const notes = String(form.get("notes") || "").trim() || null
  const file = form.get("file")
  if (!courseId || !holesRaw || !(file instanceof File)) return NextResponse.json({ error: "Course, all 18 hole scores, and scorecard evidence are required." }, { status: 400 })

  let rawHoles: unknown
  try { rawHoles = JSON.parse(holesRaw) } catch { return NextResponse.json({ error: "Hole scores are invalid." }, { status: 400 }) }
  const course = await service.from("all_time_courses").select("id,par,hole_pars,difficulty").eq("id", courseId).eq("active", true).in("difficulty", ["Easy", "Hard"]).maybeSingle()
  if (course.error || !course.data) return NextResponse.json({ error: "The selected course is unavailable." }, { status: 400 })
  const courseRow = course.data
  if (!Array.isArray(rawHoles) || rawHoles.length !== 18 || !Array.isArray(courseRow.hole_pars)) return NextResponse.json({ error: "Exactly 18 holes with authoritative pars are required." }, { status: 400 })
  const holes: ScorecardHoleInput[] = rawHoles.map((value, index) => ({ holeNumber: index + 1, par: Number(courseRow.hole_pars[index]), strokes: Number(value) }))
  let totals: ReturnType<typeof calculateScorecardTotals>
  try { totals = calculateScorecardTotals(holes, courseRow.hole_pars as number[]) } catch (caught) { return NextResponse.json({ error: caught instanceof Error ? caught.message : "Hole scores are invalid." }, { status: 400 }) }
  if (scoreRaw !== "" && Number(scoreRaw) !== totals.scoreToPar) return NextResponse.json({ error: "The entered score does not match the 18 hole scores." }, { status: 400 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isSupportedScorecardEvidence(file.type, bytes.byteLength)) return NextResponse.json({ error: "Upload a supported scorecard image no larger than 10 MB." }, { status: 400 })
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const uploadId = randomUUID()
  const path = `all-time/${identity.playerId}/${uploadId}-${safeScorecardEvidenceFilename(file.name, file.type)}`
  const upload = await service.storage.from(bucket).upload(path, bytes, { contentType: file.type.toLowerCase(), cacheControl: "3600", upsert: false })
  if (upload.error) return NextResponse.json({ error: "Private scorecard storage failed." }, { status: 503 })

  const inserted = await session.rpc("create_all_time_player_submission", { p_course_id: courseId, p_score: totals.scoreToPar, p_hole_strokes: rawHoles, p_evidence_storage_path: path, p_original_filename: file.name, p_content_type: file.type, p_evidence_sha256: sha256, p_notes: notes })
  if (inserted.error) { await service.storage.from(bucket).remove([path]); return NextResponse.json({ error: inserted.error.message }, { status: 400 }) }
  return NextResponse.json({ ...(inserted.data as Record<string, unknown>), message: "ALL-TIME SCORE SUBMITTED — PENDING REVIEW" }, { status: 201 })
}
