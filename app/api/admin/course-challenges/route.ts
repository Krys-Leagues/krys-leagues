import { getCourseChallenge } from "@/lib/courseChallenges/catalog"
import { levelRewardDefinitions, aceRewardDefinition } from "@/lib/courseChallenges/rewards"
import { createCourseChallengesServiceClient, requireCourseChallengeAdmin } from "@/lib/courseChallenges/server"

export async function GET() {
  const authorization = await requireCourseChallengeAdmin()
  if (authorization.response) return authorization.response
  try {
    const service = createCourseChallengesServiceClient()
    const { data: rows, error } = await service.from("course_challenge_submissions").select("id,player_id,course_slug,challenge_key,level_number,difficulty,proof_photo_path,hole_scores,total_par,calculated_total,relative_to_par,entered_final_score,final_score_check,requirements_evaluation,status,review_reason,round_date,round_time,game_mode,created_at").in("status", ["pending", "needs_review"]).order("created_at", { ascending: true })
    if (error) throw error
    const submissions = (rows || []) as Array<Record<string, unknown>>
    const playerIds = [...new Set(submissions.map((row) => String(row.player_id)))]
    const players = playerIds.length ? await service.from("players").select("id,screen_name").in("id", playerIds) : { data: [], error: null }
    if (players.error) throw players.error
    const playerNames = new Map((players.data || []).map((player) => [String(player.id), String(player.screen_name)]))
    const output = await Promise.all(submissions.map(async (row) => {
      const course = getCourseChallenge(String(row.course_slug))
      const level = course?.levels.find((item) => item.level === Number(row.level_number))
      const code = row.difficulty === "Easy" ? (level?.easyCode || course?.easyCode) : (level?.hardCode || course?.hardCode)
      const pars = code ? await service.from("all_time_courses").select("hole_pars").eq("code", code).maybeSingle() : { data: null, error: null }
      if (pars.error) throw pars.error
      const signed = row.proof_photo_path ? await service.storage.from("course-challenge-proof").createSignedUrl(String(row.proof_photo_path), 600) : { data: null, error: null }
      return { id: String(row.id), playerId: String(row.player_id), playerName: playerNames.get(String(row.player_id)) || "Unknown player", courseSlug: String(row.course_slug), courseName: course?.name || String(row.course_slug), challengeKey: row.challenge_key === "ace" ? "ace" : "level", level: Number(row.level_number), difficulty: row.difficulty, proofPhotoUrl: signed.data?.signedUrl || null, holeScores: row.hole_scores as number[], pars: pars.data?.hole_pars as number[] | null, calculatedTotal: Number(row.calculated_total), relativeToPar: Number(row.relative_to_par), requirements: (row.requirements_evaluation || []) as Array<Record<string, unknown>>, status: String(row.status), reviewReason: row.review_reason ? String(row.review_reason) : null, roundDate: row.round_date ? String(row.round_date) : null, roundTime: row.round_time ? String(row.round_time) : null, gameMode: row.game_mode ? String(row.game_mode) : null, enteredFinalScore: row.entered_final_score === null || row.entered_final_score === undefined ? null : Number(row.entered_final_score), finalScoreCheck: row.final_score_check ? String(row.final_score_check) : null, createdAt: row.created_at ? String(row.created_at) : null }
    }))
    return Response.json({ submissions: output }, { headers: { "Cache-Control": "no-store" } })
  } catch (caught) { return Response.json({ error: caught instanceof Error ? caught.message : "Course Challenge reviews are unavailable." }, { status: 503 }) }
}

export async function PATCH(request: Request) {
  const authorization = await requireCourseChallengeAdmin()
  if (authorization.response) return authorization.response
  try {
    const body = await request.json() as { id?: string; action?: "approve" | "reject"; reviewNotes?: string }
    if (!body.id || !body.action) return Response.json({ error: "Submission ID and review action are required." }, { status: 400 })
    const service = createCourseChallengesServiceClient()
    const submission = await service.from("course_challenge_submissions").select("id,player_id,course_slug,challenge_key,level_number,difficulty,status").eq("id", body.id).maybeSingle()
    if (submission.error) throw submission.error
    if (!submission.data) return Response.json({ error: "Submission not found." }, { status: 404 })
    if (!["pending", "needs_review"].includes(String(submission.data.status))) return Response.json({ error: "This submission has already been reviewed." }, { status: 409 })
    const nextStatus = body.action === "approve" ? "approved" : "rejected"
    const update = await service.from("course_challenge_submissions").update({ status: nextStatus, reviewed_at: new Date().toISOString(), reviewed_by: authorization.user?.id || null, review_notes: body.reviewNotes?.trim() || null }).eq("id", body.id)
    if (update.error) throw update.error
    if (nextStatus === "approved") await updateProgressAndRewards(service, String(submission.data.player_id), String(submission.data.course_slug), Number(submission.data.level_number), String(submission.data.difficulty), submission.data.challenge_key === "ace" ? "ace" : "level", authorization.user?.id || null)
    return Response.json({ message: nextStatus === "approved" ? "Submission approved. Progress and idempotent rewards were synchronized." : "Submission rejected. No progress or rewards were unlocked." })
  } catch (caught) { return Response.json({ error: caught instanceof Error ? caught.message : "Course Challenge review failed." }, { status: 503 }) }
}

async function updateProgressAndRewards(service: ReturnType<typeof createCourseChallengesServiceClient>, playerId: string, courseSlug: string, level: number, difficulty: string, challengeKey: "level" | "ace", reviewerId: string | null) {
  const accepted = await service.from("course_challenge_submissions").select("difficulty").eq("player_id", playerId).eq("course_slug", courseSlug).eq("level_number", level).eq("challenge_key", challengeKey).eq("status", "approved")
  if (accepted.error) throw accepted.error
  const easyApproved = (accepted.data || []).some((row) => row.difficulty === "Easy")
  const hardApproved = (accepted.data || []).some((row) => row.difficulty === "Hard")
  const complete = easyApproved && hardApproved
  if (challengeKey === "ace") {
    if (!complete) return
    const course = getCourseChallenge(courseSlug)
    const reward = course ? aceRewardDefinition(course) : null
    if (!reward) return
    const award = await service.from("course_challenge_rewards").upsert([{ player_id: playerId, reward_key: reward.rewardKey, label: reward.label, kind: reward.kind, course_slug: courseSlug, level: null, awarded_by: reviewerId }], { onConflict: "player_id,reward_key", ignoreDuplicates: true })
    if (award.error) throw award.error
    return
  }
  const progress = await service.from("course_challenge_progress").upsert({ player_id: playerId, course_slug: courseSlug, level_number: level, easy_status: easyApproved ? "approved" : "pending", hard_status: hardApproved ? "approved" : "pending", completed_at: complete ? new Date().toISOString() : null, updated_at: new Date().toISOString() }, { onConflict: "player_id,course_slug,level_number" })
  if (progress.error) throw progress.error
  if (!complete) return
  const course = getCourseChallenge(courseSlug)
  if (!course) return
  const rewards = levelRewardDefinitions(course, level).map((reward) => ({ player_id: playerId, reward_key: reward.rewardKey, label: reward.label, kind: reward.kind, course_slug: courseSlug, level: reward.level, awarded_by: reviewerId }))
  const award = await service.from("course_challenge_rewards").upsert(rewards, { onConflict: "player_id,reward_key", ignoreDuplicates: true })
  if (award.error) throw award.error
}
