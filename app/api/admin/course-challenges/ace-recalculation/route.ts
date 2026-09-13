import { buildAceRecalculationReport, type AceRecalculationRow } from "@/lib/courseChallenges/aceRecalculation"
import { requireCourseChallengeAdmin, createCourseChallengesServiceClient } from "@/lib/courseChallenges/server"

export async function GET() {
  const authorization = await requireCourseChallengeAdmin()
  if (authorization.response) return authorization.response
  try {
    const service = createCourseChallengesServiceClient()
    const submissions = await service.from("course_challenge_submissions").select("id,player_id,course_slug,challenge_key,level_number,difficulty,hole_scores,requirements_evaluation,status,created_at").in("course_slug", ["tourist-trap", "cherry-blossom"]).order("created_at", { ascending: true })
    if (submissions.error) throw submissions.error
    const stored = await service.from("course_challenge_ace_progress").select("player_id,course_slug,stage_number,completed_at").in("course_slug", ["tourist-trap", "cherry-blossom"])
    if (stored.error) throw stored.error
    const playerIds = [...new Set((submissions.data || []).map((row) => String(row.player_id)).concat((stored.data || []).map((row) => String(row.player_id))))]
    const players = playerIds.length ? await service.from("players").select("id,screen_name").in("id", playerIds) : { data: [], error: null }
    if (players.error) throw players.error
    const playerNames = new Map((players.data || []).map((player) => [String(player.id), String(player.screen_name)]))
    const reports = buildAceRecalculationReport({ rows: (submissions.data || []) as AceRecalculationRow[], storedRows: (stored.data || []).map((row) => ({ player_id: String(row.player_id), course_slug: String(row.course_slug), stage_number: Number(row.stage_number), completed_at: row.completed_at ? String(row.completed_at) : null })), playerNames })
    return Response.json({ dryRun: true, writesPerformed: false, reports }, { headers: { "Cache-Control": "no-store" } })
  } catch (caught) {
    return Response.json({ error: caught instanceof Error ? caught.message : "Ace Track recalculation is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
