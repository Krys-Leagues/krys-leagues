import { NextResponse } from "next/server"
import { authorizeSoloAdmin } from "@/lib/soloAdminServer"
import { createScorecardServiceClient } from "@/lib/scorecards/server"

export const runtime = "nodejs"
const bucket = "shared-scorecard-evidence"
const reviewStatuses = ["provisional", "verified", "rejected", "superseded_for_score", "superseded_for_hn1"] as const

export async function GET(request: Request) {
  const authorization = await authorizeSoloAdmin()
  if (!authorization.authorized) return authorization.response
  const service = createScorecardServiceClient()
  const requested = new URL(request.url).searchParams.get("status") || "provisional"
  const status = requested === "all" || reviewStatuses.includes(requested as typeof reviewStatuses[number]) ? requested : "provisional"
  const statuses = status === "all" ? [...reviewStatuses] : [status]
  const result = await service.from("solo_submissions").select("id,season_id,week_id,player_id,difficulty,submission_intent,stroke_score,hn1_count,status,evidence_storage_path,original_filename,submitted_at,reviewed_at,rejection_reason").in("status", statuses).order("submitted_at", { ascending: true }).limit(500)
  if (result.error) return NextResponse.json({ error: "Solo review queue unavailable" }, { status: 503 })
  const rows = result.data || []
  if (rows.length === 0) return NextResponse.json({ submissions: [] }, { headers: { "Cache-Control": "no-store" } })
  const playerIds = [...new Set(rows.map((row) => row.player_id))]
  const weekIds = [...new Set(rows.map((row) => row.week_id))]
  const [players, weeks, scoreSources, hn1Sources] = await Promise.all([
    service.from("players").select("id,screen_name").in("id", playerIds),
    service.from("solo_weeks").select("id,week_number,course_name,course_code,status,due_date").in("id", weekIds),
    service.from("solo_live_best_attempts_v2").select("source_submission_id").in("source_submission_id", rows.map((row) => row.id)).not("source_submission_id", "is", null),
    service.from("solo_live_hn1_recognition_v2").select("source_submission_id").in("source_submission_id", rows.map((row) => row.id)).not("source_submission_id", "is", null),
  ])
  if (players.error || weeks.error || scoreSources.error || hn1Sources.error) return NextResponse.json({ error: "Solo review context unavailable" }, { status: 503 })
  const playerNames = new Map((players.data || []).map((row) => [row.id, row.screen_name]))
  const weekMap = new Map((weeks.data || []).map((row) => [row.id, row]))
  const scoreSourceIds = new Set((scoreSources.data || []).map((row) => row.source_submission_id).filter((id): id is string => Boolean(id)))
  const hn1SourceIds = new Set((hn1Sources.data || []).map((row) => row.source_submission_id).filter((id): id is string => Boolean(id)))
  const output = await Promise.all(rows.map(async (row) => {
    const signed = await service.storage.from(bucket).createSignedUrl(row.evidence_storage_path, 3600)
    return { ...row, player_screen_name: playerNames.get(row.player_id) || "Unknown player", week: weekMap.get(row.week_id) || null, evidence_url: signed.data?.signedUrl || null, affects_score: scoreSourceIds.has(row.id), affects_hn1: hn1SourceIds.has(row.id) }
  }))
  return NextResponse.json({ submissions: output }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const authorization = await authorizeSoloAdmin()
  if (!authorization.authorized) return authorization.response
  const body = await request.json().catch(() => null) as { submissionId?: unknown; decision?: unknown; reason?: unknown } | null
  if (typeof body?.submissionId !== "string" || (body.decision !== "verified" && body.decision !== "rejected")) return NextResponse.json({ error: "Submission and valid decision are required" }, { status: 400 })
  const { data, error } = await authorization.supabase.rpc("review_solo_submission", { p_submission_id: body.submissionId, p_decision: body.decision, p_reason: typeof body.reason === "string" ? body.reason : null })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ submission: data })
}
