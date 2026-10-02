import { createHash } from "node:crypto"
import { NextResponse } from "next/server"

import { aceProgress, reviewEventCountsTowardAceTrack, type AceSubmissionRecord } from "@/lib/courseChallenges/ace"
import { getCourseChallenge } from "@/lib/courseChallenges/catalog"
import { allowedDiscordEvidenceUrl, discordEvidenceExtension, DISCORD_GAME_SOURCE, nextIncompleteCourseChallengeLevel } from "@/lib/courseChallenges/discordHandoff"
import { parseVerifiedScorecardJson, verifyScorecardBridgeRequest } from "@/lib/scorecards/bridge"
import { createScorecardServiceClient, resolveCanonicalDiscordPlayerResult } from "@/lib/scorecards/server"

export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DISCORD_ID = /^\d{15,22}$/
const MAX_IMAGE_BYTES = 12_000_000
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

type Delivery = {
  idempotencyKey?: unknown; gameId?: unknown; bookKey?: unknown; roomName?: unknown
  discordUserId?: unknown; discordDisplayName?: unknown; scorecardId?: unknown
  scorecardAttachmentReference?: unknown; confirmationTimestamp?: unknown
  gameThreadId?: unknown; submissionTimestamp?: unknown
}

function invalid(body: Delivery) {
  return !UUID.test(String(body.idempotencyKey || "")) || !UUID.test(String(body.gameId || ""))
    || !UUID.test(String(body.scorecardId || "")) || !DISCORD_ID.test(String(body.discordUserId || ""))
    || !["tourist-trap", "cherry-blossom"].includes(String(body.bookKey || ""))
    || !allowedDiscordEvidenceUrl(String(body.scorecardAttachmentReference || ""))
    || !String(body.confirmationTimestamp || "").match(/^\d{4}-\d{2}-\d{2}T/)
    || !String(body.submissionTimestamp || "").match(/^\d{4}-\d{2}-\d{2}T/)
}

export async function POST(request: Request) {
  const verification = await verifyScorecardBridgeRequest(request)
  if (!verification.verified) return verification.response
  let body: Delivery
  try { body = parseVerifiedScorecardJson<Delivery>(verification.body) } catch { return NextResponse.json({ error: "Invalid review delivery payload.", code: "INVALID_PAYLOAD" }, { status: 400 }) }
  if (invalid(body)) return NextResponse.json({ error: "Invalid review delivery payload.", code: "INVALID_PAYLOAD" }, { status: 400 })

  const idempotencyKey = String(body.idempotencyKey)
  const service = createScorecardServiceClient()
  const existing = await service.from("course_challenge_submissions").select("id,player_id,status").eq("source_idempotency_key", idempotencyKey).maybeSingle()
  if (existing.error) return unavailable()
  if (existing.data) return NextResponse.json({ ok: true, duplicate: true, idempotencyKey, submissionId: existing.data.id, playerId: existing.data.player_id, status: existing.data.status })

  let identity: Awaited<ReturnType<typeof resolveCanonicalDiscordPlayerResult>>
  try { identity = await resolveCanonicalDiscordPlayerResult(service, String(body.discordUserId)) } catch { return NextResponse.json({ error: "Canonical player identity lookup failed.", code: "CANONICAL_IDENTITY_UNAVAILABLE" }, { status: 503 }) }
  if (identity.status === "not_found") return NextResponse.json({ error: "Canonical player was not found for this Discord identity.", code: "CANONICAL_PLAYER_NOT_FOUND" }, { status: 409 })
  if (identity.status === "ambiguous") return NextResponse.json({ error: "Discord identity resolves to multiple canonical players.", code: "AMBIGUOUS_PLAYER_IDENTITY" }, { status: 409 })
  const playerId = identity.playerId

  const course = getCourseChallenge(String(body.bookKey))
  if (!course) return NextResponse.json({ error: "Course Challenge book is unavailable.", code: "COURSE_UNAVAILABLE" }, { status: 409 })
  const progress = await service.from("course_challenge_progress").select("level_number,completed_at").eq("player_id", playerId).eq("course_slug", course.slug)
  if (progress.error) return unavailable()
  const completedLevels = (progress.data || []).filter((row) => row.completed_at).map((row) => Number(row.level_number))
  const level = nextIncompleteCourseChallengeLevel(completedLevels)
  if (!level) return NextResponse.json({ error: "Player has no open regular Level for this book.", code: "NO_OPEN_LEVEL" }, { status: 409 })

  let aceStage: number | null
  try { aceStage = await currentAceStage(service, playerId, course.slug, course) } catch { return unavailable() }
  let evidence: Response
  try { evidence = await fetch(String(body.scorecardAttachmentReference), { signal: AbortSignal.timeout(12_000), cache: "no-store" }) } catch { return NextResponse.json({ error: "Scorecard evidence is temporarily unavailable.", code: "EVIDENCE_UNAVAILABLE" }, { status: 503 }) }
  const contentType = (evidence.headers.get("content-type") || "").split(";")[0].toLowerCase()
  const declaredLength = Number(evidence.headers.get("content-length") || 0)
  if (!evidence.ok || !IMAGE_TYPES.has(contentType) || declaredLength > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Scorecard evidence is invalid or unavailable.", code: "EVIDENCE_INVALID" }, { status: 422 })
  const bytes = new Uint8Array(await evidence.arrayBuffer())
  if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Scorecard evidence is invalid or too large.", code: "EVIDENCE_INVALID" }, { status: 422 })
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const proofPath = `discord-games/${String(body.gameId)}/${String(body.scorecardId)}.${discordEvidenceExtension(contentType)}`
  const upload = await service.storage.from("course-challenge-proof").upload(proofPath, bytes, { contentType, cacheControl: "3600", upsert: false })
  if (upload.error && !String(upload.error.message || "").toLowerCase().includes("already exists")) return unavailable("Scorecard evidence could not be stored.")

  const metadata = { gameId: body.gameId, roomName: body.roomName || null, gameThreadId: body.gameThreadId, scorecardId: body.scorecardId, discordDisplayName: String(body.discordDisplayName || "").slice(0, 100), confirmationTimestamp: body.confirmationTimestamp, submissionTimestamp: body.submissionTimestamp }
  const inserted = await service.from("course_challenge_submissions").insert({
    player_id: playerId, course_slug: course.slug, challenge_key: "level", level_number: level,
    ace_stage_number: aceStage, difficulty: "Easy", proof_photo_path: proofPath,
    round_date: null, round_time: null, game_mode: "multiplayer", proof_image_sha256: sha256,
    hole_scores: null, calculated_total: null, total_par: null, relative_to_par: null,
    entered_final_score: null, final_score_check: null, metrics: null, requirements_evaluation: null,
    auto_evaluation_status: "needs_review", photo_total_check: "needs_review", status: "needs_review",
    review_reason: "Confirmed Course Challenges Discord game scorecard requires authorized admin visual review.",
    submission_source: DISCORD_GAME_SOURCE, source_idempotency_key: idempotencyKey,
    source_discord_user_id: String(body.discordUserId), source_metadata: metadata,
  }).select("id,player_id,status").single()
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const raced = await service.from("course_challenge_submissions").select("id,player_id,status").eq("source_idempotency_key", idempotencyKey).single()
      if (!raced.error) return NextResponse.json({ ok: true, duplicate: true, idempotencyKey, submissionId: raced.data.id, playerId: raced.data.player_id, status: raced.data.status })
    }
    return unavailable()
  }
  await service.from("course_challenge_submission_review_events").insert({ submission_id: inserted.data.id, action: "submitted", from_status: null, to_status: "needs_review", metadata: { source: DISCORD_GAME_SOURCE, ...metadata } })
  return NextResponse.json({ ok: true, duplicate: false, idempotencyKey, submissionId: inserted.data.id, playerId: inserted.data.player_id, status: inserted.data.status }, { status: 201 })
}

function unavailable(message = "Course Challenge review delivery is temporarily unavailable.") { return NextResponse.json({ error: message, code: "DELIVERY_UNAVAILABLE" }, { status: 503 }) }

async function currentAceStage(service: ReturnType<typeof createScorecardServiceClient>, playerId: string, courseSlug: string, course: NonNullable<ReturnType<typeof getCourseChallenge>>) {
  const submissions = await service.from("course_challenge_submissions").select("id,challenge_key,level_number,ace_stage_number,difficulty,hole_scores,reviewed_hole_scores,requirements_evaluation,reviewed_requirements_evaluation,status,created_at").eq("player_id", playerId).eq("course_slug", courseSlug).eq("status", "approved")
  if (submissions.error) throw submissions.error
  const ids = (submissions.data || []).map((row) => String(row.id))
  const events = ids.length ? await service.from("course_challenge_submission_review_events").select("submission_id,metadata").in("submission_id", ids) : { data: [], error: null }
  if (events.error) throw events.error
  const credited = new Set((events.data || []).filter((event) => reviewEventCountsTowardAceTrack(event.metadata)).map((event) => String(event.submission_id)))
  const rows = (submissions.data || []).filter((row) => row.challenge_key === "ace" || (Number(row.ace_stage_number) > 0 && credited.has(String(row.id)))).map((row) => ({ ...row, hole_scores: row.reviewed_hole_scores || row.hole_scores, requirements_evaluation: row.reviewed_requirements_evaluation || row.requirements_evaluation })) as AceSubmissionRecord[]
  const stored = await service.from("course_challenge_ace_progress").select("stage_number,completed_at").eq("player_id", playerId).eq("course_slug", courseSlug)
  if (stored.error) throw stored.error
  return aceProgress(course, rows, (stored.data || []).filter((row) => row.completed_at).map((row) => Number(row.stage_number))).nextStage?.stage || null
}
