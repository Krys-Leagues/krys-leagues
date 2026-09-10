import { getCourseChallenge } from "@/lib/courseChallenges/catalog"
import { levelRewardDefinitions, aceRewardDefinition } from "@/lib/courseChallenges/rewards"
import { createCourseChallengesServiceClient, requireCourseChallengeAdmin } from "@/lib/courseChallenges/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { sha256Hex } from "@/lib/all-time/normal-records"

export async function GET(request: Request) {
  const authorization = await requireCourseChallengeAdmin()
  if (authorization.response) return authorization.response
  try {
    const service = createCourseChallengesServiceClient()
    const params = new URL(request.url).searchParams
    const statuses = params.get("status") === "rejected" ? ["rejected"] : params.get("includeRejected") === "1" ? ["pending", "needs_review", "rejected"] : ["pending", "needs_review"]
    const pendingQuery = service.from("course_challenge_submissions").select("id,created_at", { count: "exact" }).in("status", ["pending", "needs_review"]).order("created_at", { ascending: false })
    const pendingResult = await pendingQuery
    if (pendingResult.error) throw pendingResult.error
    if (params.get("summary") === "1") {
      return Response.json({ pendingCount: pendingResult.count || 0, latestPendingId: pendingResult.data?.[0]?.id || null, latestPendingAt: pendingResult.data?.[0]?.created_at || null }, { headers: { "Cache-Control": "no-store" } })
    }
    const { data: rows, error } = await service.from("course_challenge_submissions").select("id,player_id,course_slug,challenge_key,level_number,difficulty,proof_photo_path,proof_image_sha256,hole_scores,total_par,calculated_total,relative_to_par,entered_final_score,final_score_check,requirements_evaluation,status,review_reason,review_notes,round_date,round_time,game_mode,admin_verified_game_mode,created_at,reviewed_at,reviewed_by,all_time_processing_status,all_time_processing_result").in("status", statuses).order("created_at", { ascending: true })
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
      const pastCards = await loadPastCards(service, String(row.player_id), String(row.course_slug), String(row.id))
      const duplicate = row.proof_image_sha256 ? await service.from("course_challenge_submissions").select("id").eq("proof_image_sha256", String(row.proof_image_sha256)).neq("id", String(row.id)).limit(1).maybeSingle() : { data: null, error: null }
      if (duplicate.error) throw duplicate.error
      const events = await service.from("course_challenge_submission_review_events").select("id,action,from_status,to_status,reviewer_id,notes,created_at").eq("submission_id", String(row.id)).order("created_at", { ascending: true })
      if (events.error) throw events.error
      return { id: String(row.id), playerId: String(row.player_id), playerName: playerNames.get(String(row.player_id)) || "Unknown player", courseSlug: String(row.course_slug), courseName: course?.name || String(row.course_slug), challengeKey: row.challenge_key === "ace" ? "ace" : "level", level: Number(row.level_number), difficulty: row.difficulty, proofPhotoUrl: signed.data?.signedUrl || null, holeScores: row.hole_scores as number[], pars: pars.data?.hole_pars as number[] | null, calculatedTotal: Number(row.calculated_total), relativeToPar: Number(row.relative_to_par), requirements: (row.requirements_evaluation || []) as Array<Record<string, unknown>>, status: String(row.status), reviewReason: row.review_reason ? String(row.review_reason) : null, reviewNotes: row.review_notes ? String(row.review_notes) : null, roundDate: row.round_date ? String(row.round_date) : null, roundTime: row.round_time ? String(row.round_time) : null, gameMode: row.game_mode ? String(row.game_mode) : null, adminVerifiedGameMode: row.admin_verified_game_mode ? String(row.admin_verified_game_mode) : null, enteredFinalScore: row.entered_final_score === null || row.entered_final_score === undefined ? null : Number(row.entered_final_score), finalScoreCheck: row.final_score_check ? String(row.final_score_check) : null, createdAt: row.created_at ? String(row.created_at) : null, possibleDuplicate: Boolean(duplicate.data), pastCards, reviewEvents: events.data || [], allTimeProcessingStatus: String(row.all_time_processing_status || "not_processed"), allTimeProcessingResult: row.all_time_processing_result || null }
    }))
    return Response.json({ submissions: output, pendingCount: pendingResult.count || 0, latestPendingId: pendingResult.data?.[0]?.id || null, latestPendingAt: pendingResult.data?.[0]?.created_at || null }, { headers: { "Cache-Control": "no-store" } })
  } catch (caught) { return Response.json({ error: caught instanceof Error ? caught.message : "Course Challenge reviews are unavailable." }, { status: 503 }) }
}

async function signProof(service: ReturnType<typeof createCourseChallengesServiceClient>, path: unknown) {
  if (!path) return null
  const signed = await service.storage.from("course-challenge-proof").createSignedUrl(String(path), 600)
  if (signed.error) throw signed.error
  return signed.data?.signedUrl || null
}

async function loadPastCards(service: ReturnType<typeof createCourseChallengesServiceClient>, playerId: string, courseSlug: string, currentId: string) {
  const result = await service.from("course_challenge_submissions").select("id,challenge_key,level_number,difficulty,status,proof_photo_path,calculated_total,relative_to_par,created_at").eq("player_id", playerId).eq("course_slug", courseSlug).neq("id", currentId).order("created_at", { ascending: false })
  if (result.error) throw result.error
  return Promise.all((result.data || []).map(async (row) => ({ id: String(row.id), challengeKey: row.challenge_key === "ace" ? "ace" : "level", level: Number(row.level_number), difficulty: String(row.difficulty), status: String(row.status), proofPhotoUrl: await signProof(service, row.proof_photo_path), calculatedTotal: Number(row.calculated_total), relativeToPar: Number(row.relative_to_par), createdAt: String(row.created_at) })))
}

export async function PATCH(request: Request) {
  const authorization = await requireCourseChallengeAdmin()
  if (authorization.response) return authorization.response
  try {
    const body = await request.json() as { id?: string; action?: "approve" | "reject" | "return_to_review"; reviewNotes?: string; gameMode?: "solo" | "multiplayer" }
    if (!body.id || !body.action) return Response.json({ error: "Submission ID and review action are required." }, { status: 400 })
    const service = createCourseChallengesServiceClient()
    const submission = await service.from("course_challenge_submissions").select("id,player_id,course_slug,challenge_key,level_number,difficulty,status,hole_scores,relative_to_par,created_at,review_notes,all_time_processing_status").eq("id", body.id).maybeSingle()
    if (submission.error) throw submission.error
    if (!submission.data) return Response.json({ error: "Submission not found." }, { status: 404 })
    const currentStatus = String(submission.data.status)
    if (body.action === "return_to_review") {
      const sessionClient = await createServerSupabaseClient()
      const reopened = await sessionClient.rpc("return_course_challenge_submission_to_review", { p_submission_id: body.id, p_review_notes: body.reviewNotes?.trim() || null })
      if (reopened.error) throw reopened.error
      return Response.json({ message: "Submission returned to review. Its proof and previous review history were preserved." })
    }
    if (body.action === "reject" && currentStatus === "approved") return Response.json({ error: "This submission has already been approved." }, { status: 409 })
    if (body.action === "reject" && currentStatus === "rejected") return Response.json({ error: "This submission has already been rejected." }, { status: 409 })
    if (body.action === "approve" && currentStatus === "rejected") return Response.json({ error: "A rejected Course Challenge submission cannot be approved." }, { status: 409 })

    if (body.action === "reject") {
      const update = await service.from("course_challenge_submissions").update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: authorization.user?.id || null, review_notes: body.reviewNotes?.trim() || null }).eq("id", body.id).in("status", ["pending", "needs_review"]).select("id").maybeSingle()
      if (update.error) throw update.error
      if (!update.data) return Response.json({ error: "This submission was already reviewed. Refresh the queue." }, { status: 409 })
      const event = await service.from("course_challenge_submission_review_events").insert({ submission_id: body.id, action: "rejected", from_status: currentStatus, to_status: "rejected", reviewer_id: authorization.user?.id || null, notes: body.reviewNotes?.trim() || null })
      if (event.error) throw event.error
      return Response.json({ message: "Submission rejected. No All-Time, Climbers, progress, or rewards were changed." })
    }

    const submissionRow = submission.data
    const course = getCourseChallenge(String(submissionRow.course_slug))
    const level = course?.levels.find((item) => item.level === Number(submissionRow.level_number))
    const code = submissionRow.difficulty === "Easy" ? (level?.easyCode || course?.easyCode) : (level?.hardCode || course?.hardCode)
    if (!code) return Response.json({ error: "The Course Challenge has no authoritative All-Time course mapping." }, { status: 409 })
    const courseRow = await service.from("all_time_courses").select("id,code,difficulty").eq("code", code).eq("active", true).maybeSingle()
    if (courseRow.error) throw courseRow.error
    if (!courseRow.data) return Response.json({ error: "The authoritative All-Time course mapping is unavailable." }, { status: 503 })
    const fingerprint = await sha256Hex(JSON.stringify({ source: "course_challenge", submissionId: submissionRow.id, courseId: courseRow.data.id, playerId: submissionRow.player_id, holeScores: submissionRow.hole_scores, relativeToPar: submissionRow.relative_to_par }))
    const sessionClient = await createServerSupabaseClient()
    const approval = await sessionClient.rpc("approve_course_challenge_submission", { p_submission_id: body.id, p_course_id: courseRow.data.id, p_fingerprint: fingerprint, p_review_notes: body.reviewNotes?.trim() || null, p_admin_verified_game_mode: body.gameMode || null })
    if (approval.error) throw approval.error
    const progress = await updateProgressAndRewards(service, String(submissionRow.player_id), String(submissionRow.course_slug), Number(submissionRow.level_number), String(submissionRow.difficulty), submissionRow.challenge_key === "ace" ? "ace" : "level", authorization.user?.id || null)
    const result = approval.data as { all_time?: Record<string, unknown>; action?: string; game_mode?: string } | null
    return Response.json({ message: formatApprovalMessage(result?.all_time, result?.game_mode, progress), processing: result })
  } catch (caught) { return Response.json({ error: caught instanceof Error ? caught.message : "Course Challenge review failed." }, { status: 503 }) }
}

async function updateProgressAndRewards(service: ReturnType<typeof createCourseChallengesServiceClient>, playerId: string, courseSlug: string, level: number, difficulty: string, challengeKey: "level" | "ace", reviewerId: string | null) {
  const accepted = await service.from("course_challenge_submissions").select("difficulty").eq("player_id", playerId).eq("course_slug", courseSlug).eq("level_number", level).eq("challenge_key", challengeKey).eq("status", "approved")
  if (accepted.error) throw accepted.error
  const easyApproved = (accepted.data || []).some((row) => row.difficulty === "Easy")
  const hardApproved = (accepted.data || []).some((row) => row.difficulty === "Hard")
  const complete = easyApproved && hardApproved
  if (challengeKey === "ace") {
    if (!complete) return { complete: false, rewardLabels: [] as string[] }
    const course = getCourseChallenge(courseSlug)
    const reward = course ? aceRewardDefinition(course) : null
    if (!reward) return { complete: true, rewardLabels: [] as string[] }
    const award = await service.from("course_challenge_rewards").upsert([{ player_id: playerId, reward_key: reward.rewardKey, label: reward.label, kind: reward.kind, course_slug: courseSlug, level: null, awarded_by: reviewerId }], { onConflict: "player_id,reward_key", ignoreDuplicates: true })
    if (award.error) throw award.error
    return { complete: true, rewardLabels: [reward.label] }
  }
  const progress = await service.from("course_challenge_progress").upsert({ player_id: playerId, course_slug: courseSlug, level_number: level, easy_status: easyApproved ? "approved" : "pending", hard_status: hardApproved ? "approved" : "pending", completed_at: complete ? new Date().toISOString() : null, updated_at: new Date().toISOString() }, { onConflict: "player_id,course_slug,level_number" })
  if (progress.error) throw progress.error
  if (!complete) return { complete: false, rewardLabels: [] as string[] }
  const course = getCourseChallenge(courseSlug)
  if (!course) return { complete: true, rewardLabels: [] as string[] }
  const rewards = levelRewardDefinitions(course, level).map((reward) => ({ player_id: playerId, reward_key: reward.rewardKey, label: reward.label, kind: reward.kind, course_slug: courseSlug, level: reward.level, awarded_by: reviewerId }))
  const award = await service.from("course_challenge_rewards").upsert(rewards, { onConflict: "player_id,reward_key", ignoreDuplicates: true })
  if (award.error) throw award.error
  return { complete: true, rewardLabels: rewards.map((reward) => reward.label) }
}

function formatApprovalMessage(allTime: Record<string, unknown> | undefined, gameMode: string | undefined, progress: { complete: boolean; rewardLabels: string[] }) {
  const classification = String(allTime?.classification || allTime?.action || "")
  const score = formatRelativeScore(allTime?.submitted_score)
  const previous = formatRelativeScore(allTime?.old_pb_score)
  const points = Number(allTime?.climbers_points || 0)
  const passed = Array.isArray(allTime?.passed_player_ids) ? allTime?.passed_player_ids.length : points
  const modeLine = `Mode: ${gameMode === "solo" ? "Solo" : "Multiplayer"}`
  const allTimeLine = gameMode === "solo"
    ? "All-Time: Not eligible — Solo round"
    : classification === "FIRST"
    ? `All-Time: New first score: ${score}`
    : classification === "BETTER"
      ? `All-Time: New PB: ${score}\nPrevious PB: ${previous}`
      : classification === "EQUAL"
        ? `All-Time: Existing PB remains ${previous}\nSubmitted score: ${score}`
        : `All-Time: Existing PB remains ${previous}\nSubmitted score: ${score}`
  const climbersLine = gameMode === "solo"
    ? "Climbers: Not eligible"
    : classification === "FIRST"
    ? "Climbers: Starting PB — 0 points"
    : classification === "BETTER"
      ? `Climbers: ${passed} player${passed === 1 ? "" : "s"} passed\n${points} point${points === 1 ? "" : "s"} earned`
      : "Climbers: No event"
  const rewardLine = progress.complete && progress.rewardLabels.length ? `\nCourse Challenges: ${progress.rewardLabels.join(", ")} awarded.` : ""
  return `COURSE CHALLENGE APPROVED\n${modeLine}\n\n${allTimeLine}\n\n${climbersLine}${rewardLine}`
}

function formatRelativeScore(value: unknown) {
  if (value === null || value === undefined || value === "") return "—"
  const score = Number(value)
  return Number.isFinite(score) && score > 0 ? `+${score}` : String(value)
}
