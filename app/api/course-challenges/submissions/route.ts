import { getCourseChallenge, getCourseChallengeLevel, getPrestigeStage, isAceChallengeUnlocked, isRegularTrackComplete } from "@/lib/courseChallenges/catalog"
import { aceProgress, type AceSubmissionRecord } from "@/lib/courseChallenges/ace"
import { eligibleRoundDate, audienceForCanonicalPlayer } from "@/lib/courseChallenges/release"
import { createCourseChallengesServiceClient, getCourseChallengeIdentity } from "@/lib/courseChallenges/server"
import type { CourseChallengeDifficulty, CourseChallengeSubmissionPayload } from "@/lib/courseChallenges/types"

function isDate(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) }
function isTime(value: unknown): value is string { return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) }

export async function POST(request: Request) {
  try {
    const identity = await getCourseChallengeIdentity()
    if (!identity) return Response.json({ error: "A canonical Krys Leagues player identity is required for Course Challenge submissions." }, { status: 401 })
    const body = await request.json() as Partial<CourseChallengeSubmissionPayload> & { aceStage?: number; prestigeStage?: number }
    const course = typeof body.courseSlug === "string" ? getCourseChallenge(body.courseSlug) : null
    const challengeKey = body.challengeKey === "ace" ? "ace" : body.challengeKey === "prestige" ? "prestige" : "level"
    const requestedLevel = typeof body.level === "number" ? body.level : Number(body.level)
    const difficulty = body.difficulty as CourseChallengeDifficulty
    const currentLevel = course && challengeKey === "level" ? getCourseChallengeLevel(course, requestedLevel) : null
    const requestedAceStage = typeof body.aceStage === "number" ? body.aceStage : Number(body.aceStage)
    const requestedPrestigeStage = typeof body.prestigeStage === "number" ? body.prestigeStage : Number(body.prestigeStage)
    const aceStage = course && challengeKey === "ace" ? course.aceStages?.find((stage) => stage.stage === requestedAceStage) || null : null
    const prestigeStage = course && challengeKey === "prestige" ? getPrestigeStage(course, requestedPrestigeStage) : null
    if (!course || course.status !== "live" || !["Easy", "Hard"].includes(difficulty) || (challengeKey === "level" && !currentLevel) || (challengeKey === "ace" && !aceStage) || (challengeKey === "prestige" && !prestigeStage)) return Response.json({ error: "Course Challenge course, challenge, Level, or difficulty is invalid." }, { status: 400 })
    const level = challengeKey === "ace" ? requestedAceStage : challengeKey === "prestige" ? requestedPrestigeStage : requestedLevel
    const service = createCourseChallengesServiceClient()
    const profile = await service.from("course_challenge_progress").select("level_number,completed_at").eq("player_id", identity.playerId).eq("course_slug", course.slug).order("level_number", { ascending: true })
    if (profile.error) throw profile.error
    const completedLevels = (profile.data || []).filter((row) => row.completed_at).map((row) => Number(row.level_number))
    if (challengeKey === "level" && level > 1 && !completedLevels.includes(level - 1)) return Response.json({ error: "Complete both sides of the previous Level before submitting this one." }, { status: 409 })
    if (challengeKey === "ace" && !isAceChallengeUnlocked(course, completedLevels)) return Response.json({ error: "The Ace Track is unavailable for this course." }, { status: 409 })
    if (challengeKey === "prestige") {
      if (requestedPrestigeStage === 1 && !isRegularTrackComplete(completedLevels)) return Response.json({ error: "Complete Levels 1–5 before submitting Course Pro." }, { status: 409 })
      if (requestedPrestigeStage > 1) {
        const prestigeProgress = await service.from("course_challenge_prestige_progress").select("stage_number,completed_at").eq("player_id", identity.playerId).eq("course_slug", course.slug)
        if (prestigeProgress.error) throw prestigeProgress.error
        const completedStages = (prestigeProgress.data || []).filter((row) => row.completed_at).map((row) => Number(row.stage_number))
        if (!completedStages.includes(requestedPrestigeStage - 1)) return Response.json({ error: "Complete Course Pro before submitting Course Master." }, { status: 409 })
      }
    }
    if (typeof body.proofPhotoPath !== "string" || !body.proofPhotoPath.startsWith(identity.user.id + "/")) return Response.json({ error: "A proof scorecard photo is required." }, { status: 400 })
    if (body.roundDate !== undefined && body.roundDate !== null && !isDate(body.roundDate)) return Response.json({ error: "The optional scorecard date could not be understood." }, { status: 400 })
    if (body.roundTime !== undefined && body.roundTime !== null && !isTime(body.roundTime)) return Response.json({ error: "The optional scorecard time could not be understood." }, { status: 400 })
    const audience = audienceForCanonicalPlayer(identity.playerId, identity.approvedTester)
    const eligibility = body.roundDate ? eligibleRoundDate(body.roundDate, audience) : { allowed: false as const, reason: "Scorecard date and time require admin review because no automatic image reader is installed." }
    if (body.roundDate && !eligibility.allowed) return Response.json({ error: eligibility.reason }, { status: 409 })
    // New submissions are proof-only. The private image is the review source;
    // any verified score data needed by legacy downstream credit is recorded by
    // an authorized admin after visual review, never by the player.
    const aceRows = await loadAceEligibleRows(service, identity.playerId, course.slug)
    const aceState = aceProgress(course, aceRows)
    const currentAceStage = aceState?.nextStage || null
    if (challengeKey === "ace" && (!currentAceStage || (body.aceStage !== undefined && Number(body.aceStage) !== currentAceStage.stage))) return Response.json({ error: "Submit the currently open Ace Track stage." }, { status: 409 })
    const reviewReasons = [
      "Scorecard image, visible date/time, and challenge requirements require admin visual review.",
      challengeKey === "ace" ? "Ace holes must be recorded by an authorized admin from the private image when needed for Ace credit." : null,
      challengeKey !== "ace" ? "Game Mode must be verified by an authorized admin; Practice Mode never qualifies." : null,
    ].filter((reason): reason is string => Boolean(reason))
    const proofImageSha256 = await proofHash(service, body.proofPhotoPath)
    const status = "needs_review"
    const insert = await service.from("course_challenge_submissions").insert({ player_id: identity.playerId, course_slug: course.slug, challenge_key: challengeKey, level_number: level, ace_stage_number: challengeKey === "ace" ? requestedAceStage : aceState.nextStage?.stage || null, prestige_stage_number: challengeKey === "prestige" ? requestedPrestigeStage : null, difficulty, proof_photo_path: body.proofPhotoPath, round_date: null, round_time: null, game_mode: null, proof_image_sha256: proofImageSha256, hole_scores: null, calculated_total: null, total_par: null, relative_to_par: null, entered_final_score: null, final_score_check: null, metrics: null, requirements_evaluation: null, auto_evaluation_status: "needs_review", photo_total_check: "needs_review", status, review_reason: reviewReasons.join(" ") }).select("id,status").single()
    if (insert.error) throw insert.error
    await service.from("course_challenge_submission_review_events").insert({ submission_id: insert.data?.id, action: "submitted", from_status: null, to_status: status, metadata: { source: "player_submission" } })
    await notifyCourseChallengeReview(service, String(insert.data?.id), course.name, level, difficulty)
    return Response.json({ id: insert.data?.id, status, message: "SCORECARD SUBMITTED\nWAITING FOR ADMIN APPROVAL" }, { status: 201 })
  } catch (caught) { return Response.json({ error: caught instanceof Error ? caught.message : "Course Challenge submission failed." }, { status: 503 }) }
}

async function proofHash(service: ReturnType<typeof createCourseChallengesServiceClient>, path: string): Promise<string | null> {
  try {
    const download = await service.storage.from("course-challenge-proof").download(path)
    if (download.error || !download.data) return null
    const digest = await crypto.subtle.digest("SHA-256", await download.data.arrayBuffer())
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  } catch {
    return null
  }
}

async function loadAceEligibleRows(service: ReturnType<typeof createCourseChallengesServiceClient>, playerId: string, courseSlug: string): Promise<AceSubmissionRecord[]> {
  const submissions = await service.from("course_challenge_submissions").select("id,challenge_key,level_number,ace_stage_number,difficulty,hole_scores,reviewed_hole_scores,requirements_evaluation,reviewed_requirements_evaluation,status,created_at").eq("player_id", playerId).eq("course_slug", courseSlug).eq("status", "approved")
  if (submissions.error) throw submissions.error
  const ids = (submissions.data || []).map((row) => String(row.id))
  const events = ids.length ? await service.from("course_challenge_submission_review_events").select("submission_id,metadata").in("submission_id", ids) : { data: [], error: null }
  if (events.error) throw events.error
  const crossCredited = new Set((events.data || []).filter((event) => Boolean((event.metadata as Record<string, unknown> | null)?.count_toward_ace_track)).map((event) => String(event.submission_id)))
  return (submissions.data || []).filter((row) => row.challenge_key === "ace" || (Number(row.ace_stage_number) > 0 && crossCredited.has(String(row.id)))).map((row) => ({ ...row, hole_scores: row.reviewed_hole_scores || row.hole_scores, requirements_evaluation: row.reviewed_requirements_evaluation || row.requirements_evaluation })) as AceSubmissionRecord[]
}

async function notifyCourseChallengeReview(service: ReturnType<typeof createCourseChallengesServiceClient>, submissionId: string, courseName: string, level: number, difficulty: CourseChallengeDifficulty) {
  try {
    const webhook = process.env.DISCORD_WEBHOOK_COURSE_CHALLENGE_REVIEW
    const initial = await service.from("course_challenge_review_notifications").insert({ submission_id: submissionId, notification_kind: "discord_review_needed", status: webhook ? "failed" : "not_configured", error_message: webhook ? null : "DISCORD_WEBHOOK_COURSE_CHALLENGE_REVIEW is not configured." }).select("id").maybeSingle()
    if (initial.error) {
      if (initial.error.code === "23505") return
      return
    }
    if (!initial.data?.id || !webhook) return
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "Krys League Bot", content: `COURSE CHALLENGE REVIEW NEEDED\n\n${courseName} • Level ${level} ${difficulty}\nA new scorecard is waiting for review.\n\nOpen Review Desk: https://krysleagues.com/admin/course-challenges/review-desk` }),
      signal: AbortSignal.timeout(4000),
    })
    if (!response.ok) throw new Error("Discord rejected the review notification")
    await service.from("course_challenge_review_notifications").update({ status: "sent", sent_at: new Date().toISOString(), error_message: null }).eq("id", initial.data.id)
  } catch (caught) {
    try {
      await service.from("course_challenge_review_notifications").update({ status: "failed", error_message: caught instanceof Error ? caught.message : "Discord notification failed." }).eq("submission_id", submissionId).eq("notification_kind", "discord_review_needed")
    } catch {
      // Notification failure must never affect the saved submission.
    }
  }
}
