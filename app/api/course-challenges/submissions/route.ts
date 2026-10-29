import { getCourseChallenge, getCourseChallengeLevel, isAceChallengeUnlocked } from "@/lib/courseChallenges/catalog"
import { compareEnteredFinalScore, evaluateCourseChallengeRequirements, validHoleScores, validHolePars } from "@/lib/courseChallenges/evaluation"
import { eligibleRoundDate, audienceForCanonicalPlayer } from "@/lib/courseChallenges/release"
import { createCourseChallengesServiceClient, getCourseChallengeIdentity } from "@/lib/courseChallenges/server"
import type { CourseChallengeDifficulty, CourseChallengeSubmissionPayload } from "@/lib/courseChallenges/types"

function isDate(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) }
function isTime(value: unknown): value is string { return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) }

export async function POST(request: Request) {
  try {
    const identity = await getCourseChallengeIdentity()
    if (!identity) return Response.json({ error: "A canonical Krys Leagues player identity is required for Course Challenge submissions." }, { status: 401 })
    const body = await request.json() as Partial<CourseChallengeSubmissionPayload>
    const course = typeof body.courseSlug === "string" ? getCourseChallenge(body.courseSlug) : null
    const challengeKey = body.challengeKey === "ace" ? "ace" : "level"
    const requestedLevel = typeof body.level === "number" ? body.level : Number(body.level)
    const difficulty = body.difficulty as CourseChallengeDifficulty
    const currentLevel = course && challengeKey === "level" ? getCourseChallengeLevel(course, requestedLevel) : null
    const ace = course?.aceChallenge
    if (!course || course.status !== "live" || !["Easy", "Hard"].includes(difficulty) || (challengeKey === "level" && !currentLevel) || (challengeKey === "ace" && !ace)) return Response.json({ error: "Course Challenge course, challenge, Level, or difficulty is invalid." }, { status: 400 })
    const level = challengeKey === "ace" ? 3 : requestedLevel
    const service = createCourseChallengesServiceClient()
    const profile = await service.from("course_challenge_progress").select("level_number,completed_at").eq("player_id", identity.playerId).eq("course_slug", course.slug).order("level_number", { ascending: true })
    if (profile.error) throw profile.error
    const completedLevels = (profile.data || []).filter((row) => row.completed_at).map((row) => Number(row.level_number))
    if (challengeKey === "level" && level > 1 && !completedLevels.includes(level - 1)) return Response.json({ error: "Complete both sides of the previous Level before submitting this one." }, { status: 409 })
    if (challengeKey === "ace" && !isAceChallengeUnlocked(course, completedLevels)) return Response.json({ error: "Complete Level 3 before submitting the Ace Challenge." }, { status: 409 })
    if (typeof body.proofPhotoPath !== "string" || !body.proofPhotoPath.startsWith(identity.user.id + "/")) return Response.json({ error: "A proof scorecard photo is required." }, { status: 400 })
    if (!Array.isArray(body.scores) || !validHoleScores(body.scores)) return Response.json({ error: "Enter all 18 positive whole-number hole scores." }, { status: 400 })

    const enteredFinalScore = typeof body.finalScore === "number" ? body.finalScore : Number(body.finalScore)
    if (!Number.isInteger(enteredFinalScore)) return Response.json({ error: "Enter the final relative-to-par score shown on the scorecard." }, { status: 400 })
    if (body.roundDate !== undefined && body.roundDate !== null && !isDate(body.roundDate)) return Response.json({ error: "The optional scorecard date could not be understood." }, { status: 400 })
    if (body.roundTime !== undefined && body.roundTime !== null && !isTime(body.roundTime)) return Response.json({ error: "The optional scorecard time could not be understood." }, { status: 400 })
    const audience = audienceForCanonicalPlayer(identity.playerId, identity.approvedTester)
    const eligibility = body.roundDate ? eligibleRoundDate(body.roundDate, audience) : { allowed: false as const, reason: "Scorecard date and time require admin review because no automatic image reader is installed." }
    if (body.roundDate && !eligibility.allowed) return Response.json({ error: eligibility.reason }, { status: 409 })
    const code = difficulty === "Easy" ? course.easyCode : course.hardCode
    const courseResult = await service.from("all_time_courses").select("code,par,hole_pars").eq("code", code).maybeSingle()
    if (courseResult.error) throw courseResult.error
    const pars = courseResult.data?.hole_pars as number[] | null | undefined
    if (!validHolePars(pars || [])) return Response.json({ error: "The authoritative 18-hole pars are unavailable for this course." }, { status: 503 })
    const requirements = challengeKey === "ace" ? (difficulty === "Easy" ? ace?.easyRequirements : ace?.hardRequirements) : (difficulty === "Easy" ? currentLevel?.easyRequirements : currentLevel?.hardRequirements)
    const requirementsStatus = challengeKey === "ace" ? ace?.requirementsStatus : currentLevel?.requirementsStatus
    const evaluation = evaluateCourseChallengeRequirements(body.scores, pars || [], requirements || [], requirementsStatus || "pending_review")
    const finalScoreCheck = compareEnteredFinalScore(evaluation.metrics, enteredFinalScore)
    const reviewReasons = [
      !body.roundDate || !body.roundTime ? "Scorecard date/time evidence requires admin review." : null,
      "Game Mode must be verified by an authorized admin; Practice Mode never qualifies.",
      finalScoreCheck !== "passed" ? "Player-entered final score does not match the system-calculated relative-to-par score." : null,
      evaluation.reason || null,
    ].filter((reason): reason is string => Boolean(reason))
    const proofImageSha256 = await proofHash(service, body.proofPhotoPath)
    const status = "needs_review"
    const insert = await service.from("course_challenge_submissions").insert({ player_id: identity.playerId, course_slug: course.slug, challenge_key: challengeKey, level_number: level, difficulty, proof_photo_path: body.proofPhotoPath, round_date: body.roundDate || null, round_time: body.roundTime || null, game_mode: null, proof_image_sha256: proofImageSha256, hole_scores: body.scores, calculated_total: evaluation.metrics.totalStrokes, total_par: evaluation.metrics.totalPar, relative_to_par: evaluation.metrics.relativeToPar, entered_final_score: enteredFinalScore, final_score_check: finalScoreCheck, metrics: evaluation.metrics, requirements_evaluation: evaluation.requirements, auto_evaluation_status: evaluation.status, photo_total_check: "needs_review", status, review_reason: reviewReasons.join(" ") || "The evidence photo and challenge requirements require review." }).select("id,status").single()
    if (insert.error) throw insert.error
    await service.from("course_challenge_submission_review_events").insert({ submission_id: insert.data?.id, action: "submitted", from_status: null, to_status: status, metadata: { source: "player_submission" } })
    await notifyCourseChallengeReview(service, String(insert.data?.id), course.name, level, difficulty)
    return Response.json({ id: insert.data?.id, status, message: "Scorecard received. An authorized admin will verify the private proof and Game Mode before progression." }, { status: 201 })
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
