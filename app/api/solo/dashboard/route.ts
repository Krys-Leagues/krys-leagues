import { NextResponse } from "next/server"
import { createScorecardServiceClient } from "@/lib/scorecards/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { resolveSoloPlayer } from "@/lib/soloSubmissionServer"

export const runtime = "nodejs"

export async function GET() {
  const session = await createServerSupabaseClient()
  const userResult = await session.auth.getUser()
  if (userResult.error || !userResult.data.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const service = createScorecardServiceClient()
  const identity = await resolveSoloPlayer(service, userResult.data.user)
  if (identity.status !== "resolved") return NextResponse.json({ eligible: false, reason: identity.status })
  const [submissions, score, ace] = await Promise.all([
    service.from("solo_submissions").select("id,difficulty,submission_intent,stroke_score,hn1_count,status,evidence_storage_path,original_filename,submitted_at,reviewed_at,rejection_reason").eq("season_id", identity.season.id).eq("week_id", identity.week.id).eq("player_id", identity.playerId).order("submitted_at", { ascending: false }),
    service.from("solo_live_best_attempts_v2").select("difficulty,stroke_score,hn1_count,status,source_submission_id").eq("week_id", identity.week.id).eq("player_id", identity.playerId),
    service.from("solo_live_hn1_recognition_v2").select("difficulty,most_hn1,status,source_submission_id").eq("week_id", identity.week.id).eq("player_id", identity.playerId),
  ])
  if (submissions.error || score.error || ace.error) return NextResponse.json({ error: "Solo dashboard unavailable" }, { status: 503 })
  return NextResponse.json({ eligible: true, playerId: identity.playerId, screenName: identity.roster.player_screen_name, season: identity.season, week: identity.week, roster: identity.roster, submissions: submissions.data || [], bestScores: score.data || [], bestAces: ace.data || [] }, { headers: { "Cache-Control": "no-store" } })
}
