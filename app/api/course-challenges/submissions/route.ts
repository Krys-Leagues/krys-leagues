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
    if (body.gameMode !== undefined && body.gameMode !== null && body.gameMode !== "solo" && body.gameMode !== "multiplayer") return Response.json({ error: "The optional Game Mode evidence is invalid." }, { status: 400 })

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
      !body.gameMode ? "Game Mode evidence requires admin review; Solo and Multiplayer are eligible, Practice Mode is not." : null,
      finalScoreCheck !== "passed" ? "Player-entered final score does not match the system-calculated relative-to-par score." : null,
      evaluation.reason || null,
    ].filter((reason): reason is string => Boolean(reason))
    const status = evaluation.status === "auto_fail" && finalScoreCheck === "passed" && reviewReasons.length === 0 ? "rejected" : "needs_review"
    const insert = await service.from("course_challenge_submissions").insert({ player_id: identity.playerId, course_slug: course.slug, challenge_key: challengeKey, level_number: level, difficulty, proof_photo_path: body.proofPhotoPath, round_date: body.roundDate || null, round_time: body.roundTime || null, game_mode: body.gameMode || null, hole_scores: body.scores, calculated_total: evaluation.metrics.totalStrokes, total_par: evaluation.metrics.totalPar, relative_to_par: evaluation.metrics.relativeToPar, entered_final_score: enteredFinalScore, final_score_check: finalScoreCheck, metrics: evaluation.metrics, requirements_evaluation: evaluation.requirements, auto_evaluation_status: evaluation.status, photo_total_check: "needs_review", status, review_reason: reviewReasons.join(" ") || "The evidence photo and challenge requirements require review." }).select("id,status").single()
    if (insert.error) throw insert.error
    return Response.json({ id: insert.data?.id, status, message: status === "rejected" ? "This card did not meet the currently approved automatic checks." : "Scorecard received. Admin review will verify the photo evidence and any missing proof details before progression." }, { status: 201 })
  } catch (caught) { return Response.json({ error: caught instanceof Error ? caught.message : "Course Challenge submission failed." }, { status: 503 }) }
}
