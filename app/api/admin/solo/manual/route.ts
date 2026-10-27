import { createHash, randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { authorizeSoloAdmin } from "@/lib/soloAdminServer"
import { isSupportedScorecardEvidence, safeScorecardEvidenceFilename } from "@/lib/scorecards/core"
import { createScorecardServiceClient } from "@/lib/scorecards/server"

export const runtime = "nodejs"
const bucket = "shared-scorecard-evidence"

export async function GET(request: Request) {
  const authorization = await authorizeSoloAdmin()
  if (!authorization.authorized) return authorization.response
  const service = createScorecardServiceClient()
  const requestedSeasonId = new URL(request.url).searchParams.get("seasonId")
  const seasonsResult = await service.from("seasons").select("id,season_number,is_active").eq("league_type", "solo").is("division", null).order("season_number", { ascending: false })
  if (seasonsResult.error) return NextResponse.json({ error: "Solo seasons unavailable" }, { status: 503 })
  const seasons = seasonsResult.data || []
  const season = seasons.find((item) => item.id === requestedSeasonId) || seasons.find((item) => item.is_active) || seasons[0]
  if (!season) return NextResponse.json({ seasons: [], weeks: [], players: [] })
  const [weeksResult, rosterResult] = await Promise.all([
    service.from("solo_weeks").select("id,week_number,course_name,course_code,status,due_date").eq("season_id", season.id).eq("status", "open").order("week_number"),
    service.from("solo_roster_versions").select("id").eq("season_id", season.id).eq("status", "approved").maybeSingle(),
  ])
  if (weeksResult.error || rosterResult.error) return NextResponse.json({ error: "Solo manual-entry context unavailable" }, { status: 503 })
  const rosterId = rosterResult.data?.id
  if (!rosterId) return NextResponse.json({ seasons, selected_season_id: season.id, weeks: weeksResult.data || [], players: [] })
  const playersResult = await service.from("solo_roster_entries").select("player_id,player_screen_name,division,display_order").eq("roster_version_id", rosterId).order("display_order")
  if (playersResult.error) return NextResponse.json({ error: "Solo roster unavailable" }, { status: 503 })
  return NextResponse.json({ seasons, selected_season_id: season.id, weeks: weeksResult.data || [], players: playersResult.data || [] }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const authorization = await authorizeSoloAdmin()
  if (!authorization.authorized) return authorization.response
  const service = createScorecardServiceClient()
  const form = await request.formData()
  const seasonId = String(form.get("seasonId") || "")
  const weekId = String(form.get("weekId") || "")
  const playerId = String(form.get("playerId") || "")
  const difficulty = String(form.get("difficulty") || "").toLowerCase()
  const scoreRaw = String(form.get("score") || "").trim()
  const hn1Raw = String(form.get("hn1") || "").trim()
  const file = form.get("file")
  if (!seasonId || !weekId || !playerId || !["easy", "hard"].includes(difficulty) || !(file instanceof File)) return NextResponse.json({ error: "Season, week, player, difficulty, and a private scorecard are required." }, { status: 400 })
  const score = scoreRaw === "" ? null : Number(scoreRaw)
  const hn1 = hn1Raw === "" ? 0 : Number(hn1Raw)
  if ((score !== null && !Number.isInteger(score)) || !Number.isInteger(hn1) || hn1 < 0 || (score === null && hn1Raw === "")) return NextResponse.json({ error: "Enter a whole-number score, HN1 count, or both." }, { status: 400 })
  const [seasonResult, weekResult, rosterResult] = await Promise.all([
    service.from("seasons").select("id").eq("id", seasonId).eq("league_type", "solo").maybeSingle(),
    service.from("solo_weeks").select("id,status").eq("id", weekId).eq("season_id", seasonId).maybeSingle(),
    service.from("solo_roster_versions").select("id").eq("season_id", seasonId).eq("status", "approved").maybeSingle(),
  ])
  if (seasonResult.error || weekResult.error || rosterResult.error) return NextResponse.json({ error: "Solo manual-entry context unavailable" }, { status: 503 })
  if (!seasonResult.data || !weekResult.data || weekResult.data.status !== "open" || !rosterResult.data) return NextResponse.json({ error: "Select an exact open Solo week and approved roster." }, { status: 400 })
  const rosterEntry = await service.from("solo_roster_entries").select("player_id").eq("roster_version_id", rosterResult.data.id).eq("player_id", playerId).maybeSingle()
  if (rosterEntry.error) return NextResponse.json({ error: "Solo roster lookup failed" }, { status: 503 })
  if (!rosterEntry.data) return NextResponse.json({ error: "Player is not on the approved Solo roster." }, { status: 400 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isSupportedScorecardEvidence(file.type, bytes.byteLength)) return NextResponse.json({ error: "Upload a supported scorecard image." }, { status: 400 })
  const evidenceSha256 = createHash("sha256").update(bytes).digest("hex")
  const duplicate = await service.from("solo_submissions").select("id").eq("player_id", playerId).eq("week_id", weekId).eq("difficulty", difficulty).eq("evidence_sha256", evidenceSha256).limit(1).maybeSingle()
  if (duplicate.error) return NextResponse.json({ error: "Duplicate check failed." }, { status: 503 })
  if (duplicate.data) return NextResponse.json({ error: "This scorecard has already been entered." }, { status: 409 })
  const id = randomUUID()
  const path = `solo/manual/${seasonId}/${weekId}/${playerId}/${id}-${safeScorecardEvidenceFilename(file.name, file.type)}`
  const upload = await service.storage.from(bucket).upload(path, bytes, { contentType: file.type.toLowerCase(), cacheControl: "3600", upsert: false })
  if (upload.error) return NextResponse.json({ error: "Private scorecard storage failed." }, { status: 503 })
  const insert = await service.from("solo_submissions").insert({ id, season_id: seasonId, week_id: weekId, player_id: playerId, difficulty, submission_intent: score === null ? "ace" : "score", stroke_score: score, hn1_count: hn1, evidence_storage_path: path, original_filename: file.name.slice(0, 255), content_type: file.type.toLowerCase(), evidence_sha256: evidenceSha256, status: "verified", reviewed_at: new Date().toISOString(), reviewed_by: authorization.user.id }).select("id,status").single()
  if (insert.error) {
    await service.storage.from(bucket).remove([path])
    return NextResponse.json({ error: insert.error.message }, { status: 400 })
  }
  return NextResponse.json({ id: insert.data.id, status: insert.data.status, message: "ADMIN OVERRIDE CARD SAVED — VERIFIED" }, { status: 201 })
}
