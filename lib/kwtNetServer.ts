import "server-only"

import { createClient } from "@supabase/supabase-js"
import { calculateCourseStrokeAllowance, type VerifiedKwtEvent } from "@/lib/handicap/courseStrokeAllowance"
import { buildKwtNetResults, type KwtNetResult } from "@/lib/kwtNetLeaderboard"
import { pointsForVerifiedRank, standardCompetitionRanks } from "@/lib/kwtNetCompetition"
import { adaptProductionOperationalRows, selectFrozenPublishedHandicaps, validateVerifiedWeekSetup, type KwtWeekSetupMetadata, type ProductionOperationalResult, type ProductionPlayer, type PublishedHandicap, type VerifiedWeekSetup } from "@/lib/kwtNetProductionAdapter"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { KWT_SEASON_15_WEEK_01_RATING_REFERENCES, verifiedWeek01Badges } from "@/lib/kwtSeason15Week01Verification"

export type KwtNetPublicPayload = {
  state: "AVAILABLE" | "UNAVAILABLE"
  event: { eventIdentifier: string; season: number; week: number; courseName: string; freezeCutoff: string | null } | null
  rows: KwtNetPublicResult[]
  viewerAllowance: { easy: KwtNetPublicAllowance; hard: KwtNetPublicAllowance } | null
  season: { season: number; rows: Array<KwtNetPublicResult & { seasonRank: number; seasonPoints: number | null }>; state: "AVAILABLE" | "UNAVAILABLE" }
  reason?: "NO_VERIFIED_EVENT" | "NO_VERIFIED_RESULTS" | "NO_VERIFIED_RATINGS"
}

type KwtNetPublicAllowance = Pick<NonNullable<ReturnType<typeof calculateCourseStrokeAllowance>>, "strokes" | "direction" | "display">

type KwtNetPublicStroke = Pick<NonNullable<KwtNetResult["easyStrokes"]>, "strokes" | "direction" | "display">

export type KwtNetPublicResult = Omit<KwtNetResult, "easyGross" | "hardGross" | "combinedGross" | "easyStrokes" | "hardStrokes"> & {
  easyStrokes: KwtNetPublicStroke | null
  hardStrokes: KwtNetPublicStroke | null
}

function trustedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("KWT operational data is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
const publicResult = (result: KwtNetResult): KwtNetPublicResult => {
  const { easyGross: _easyGross, hardGross: _hardGross, combinedGross: _combinedGross, easyStrokes, hardStrokes, ...safe } = result
  void _easyGross
  void _hardGross
  void _combinedGross
  return {
    ...safe,
    easyStrokes: easyStrokes ? { strokes: easyStrokes.strokes, direction: easyStrokes.direction, display: easyStrokes.display } : null,
    hardStrokes: hardStrokes ? { strokes: hardStrokes.strokes, direction: hardStrokes.direction, display: hardStrokes.display } : null,
  }
}

export async function loadVerifiedKwtNetPayload(): Promise<KwtNetPublicPayload> {
  const unavailable = (reason: KwtNetPublicPayload["reason"], event: KwtNetPublicPayload["event"] = null): KwtNetPublicPayload => ({ state: "UNAVAILABLE", event, viewerAllowance: null, rows: [], season: { season: event?.season ?? 0, rows: [], state: "UNAVAILABLE" }, reason })
  try {
    const client = trustedClient()
    const setupResponse = await client.from("kwt_public_content").select("label,start_date,end_date,season_number,week_number,active").eq("content_type", "kwt_week_setup").eq("active", true).order("season_number", { ascending: false }).order("week_number", { ascending: false }).limit(1).maybeSingle()
    if (setupResponse.error || !setupResponse.data) return unavailable("NO_VERIFIED_EVENT")
    const season = setupResponse.data.season_number
    const week = setupResponse.data.week_number
    if (!season || !week) return unavailable("NO_VERIFIED_EVENT")
    const setup = parseWeekSetup(setupResponse.data.label, setupResponse.data.start_date, setupResponse.data.end_date, season, week, "", "")
    if (!setup) return unavailable("NO_VERIFIED_EVENT")
    const courseResponse = await client.from("all_time_courses").select("code,base_map,difficulty,display_name,active").in("code", [setup.easyCourseCode, setup.hardCourseCode]).eq("active", true)
    if (courseResponse.error || (courseResponse.data ?? []).length !== 2) return unavailable("NO_VERIFIED_EVENT")
    const ratingReferences = setup.eventIdentifier === "KWTS15W01" && setup.easyCourseCode === "RCE" && setup.hardCourseCode === "RCH"
      ? await loadApprovedWeek01Ratings(client)
      : await loadPublishedRatings(client, [setup.easyCourseCode, setup.hardCourseCode])
    if (!ratingReferences) return unavailable("NO_VERIFIED_RATINGS")
    const verifiedSetup: VerifiedWeekSetup = { ...setup, easySlope: ratingReferences.easySlope, hardSlope: ratingReferences.hardSlope }
    if (!validateVerifiedWeekSetup(verifiedSetup)) return unavailable("NO_VERIFIED_RATINGS")
    const event: VerifiedKwtEvent = { eventIdentifier: verifiedSetup.eventIdentifier, courseName: verifiedSetup.courseName, easySlope: verifiedSetup.easySlope, hardSlope: verifiedSetup.hardSlope }
    if (!Number.isFinite(event.easySlope) || !Number.isFinite(event.hardSlope) || event.easySlope <= 0 || event.hardSlope <= 0) return unavailable("NO_VERIFIED_RATINGS")
    const safeEvent = { eventIdentifier: event.eventIdentifier, season, week, courseName: event.courseName, freezeCutoff: verifiedSetup.freezeCutoff }
    const response = await client.from("kwt_operational_results").select("season_number,week_number,player_id,division,easy_course_code,hard_course_code,easy_score,hard_score,total_score,overall_placement,points,status,source_type,source_reference").eq("season_number", season).eq("week_number", week).order("overall_placement", { ascending: true })
    if (response.error) return unavailable("NO_VERIFIED_RESULTS", safeEvent)
    const raw = (response.data ?? []) as ProductionOperationalResult[]
    const viewerId = await resolveViewerCanonicalPlayerId()
    const playerIds = [...new Set([...raw.map((row) => row.player_id).filter((id): id is string => Boolean(id)), ...(viewerId ? [viewerId] : [])])]
    const [playersResponse, handicapsResponse] = await Promise.all([
      client.from("players").select("id,screen_name").in("id", playerIds),
      client.from("handicap_publishable_index_snapshots").select("canonical_player_id,resulting_index,handicap_status,effective_from,created_at").in("canonical_player_id", playerIds),
    ])
    if (playersResponse.error || handicapsResponse.error) return unavailable("NO_VERIFIED_RESULTS")
    const frozenHandicaps = selectFrozenPublishedHandicaps((handicapsResponse.data ?? []) as PublishedHandicap[], verifiedSetup.freezeCutoff)
    const viewerHandicap = viewerId ? frozenHandicaps.find((row) => row.canonical_player_id === viewerId) : undefined
    const viewerAllowance = viewerHandicap ? publicAllowance(viewerHandicap.resulting_index, verifiedSetup) : null
    const adapted = adaptProductionOperationalRows(raw, (playersResponse.data ?? []) as ProductionPlayer[], frozenHandicaps, verifiedSetup)
    const inputs = adapted.inputs.map((input) => ({
      ...input,
      badges: setup.eventIdentifier === "KWTS15W01" && setup.easyCourseCode === "RCE" && setup.hardCourseCode === "RCH" ? verifiedWeek01Badges(input.playerId) : [],
    }))
    const baseRows = buildKwtNetResults(event, inputs)
    const completed = baseRows.filter((row) => row.combinedNet !== null)
    const ranks = standardCompetitionRanks(completed.map((row) => row.combinedNet!))
    const rankById = new Map(completed.map((row, index) => [row.playerId, ranks[index]]))
    const rows = baseRows.map((row) => ({ ...row, points: rankById.has(row.playerId) ? pointsForVerifiedRank(rankById.get(row.playerId)!) : null }))
    if (rows.length === 0) return { state: "AVAILABLE", event: safeEvent, viewerAllowance, rows: [], season: { season, rows: [], state: "UNAVAILABLE" } }
    const seasonRows = completed.map((row, index) => ({ ...publicResult(rows.find((candidate) => candidate.playerId === row.playerId) ?? row), seasonRank: ranks[index], seasonPoints: pointsForVerifiedRank(ranks[index]) }))
    return { state: "AVAILABLE", event: safeEvent, viewerAllowance, rows: rows.map(publicResult), season: { season: safeEvent.season, rows: seasonRows, state: seasonRows.length ? "AVAILABLE" : "UNAVAILABLE" } }
  } catch { return unavailable("NO_VERIFIED_EVENT") }
}

async function loadApprovedWeek01Ratings(client: ReturnType<typeof trustedClient>) {
  const references = [KWT_SEASON_15_WEEK_01_RATING_REFERENCES.easy, KWT_SEASON_15_WEEK_01_RATING_REFERENCES.hard]
  const [snapshotsResponse, decisionsResponse] = await Promise.all([
    client.from("handicap_rating_snapshots").select("id,course_id,course_rating,slope,review_scope,publication_status,model_version").in("id", references.map((reference) => reference.snapshotId)),
    client.from("handicap_review_decisions").select("subject_key,decision").in("subject_key", references.map((reference) => reference.snapshotId)).eq("decision", "ACCEPT"),
  ])
  if (snapshotsResponse.error || decisionsResponse.error) return null
  const accepted = new Set((decisionsResponse.data ?? []).map((row) => row.subject_key))
  const valid = references.every((reference) => {
    const row = (snapshotsResponse.data ?? []).find((candidate) => candidate.id === reference.snapshotId)
    return Boolean(row)
      && row?.course_id === reference.courseId
      && Number(row.course_rating) === reference.courseRating
      && Number(row.slope) === reference.slope
      && row?.review_scope === "KWT_ONLY"
      && row?.publication_status === "UNPUBLISHED"
      && row?.model_version === "krys-course-rating-elite-lowest-12-v1"
      && accepted.has(reference.snapshotId)
  })
  if (!valid) return null
  return { easySlope: KWT_SEASON_15_WEEK_01_RATING_REFERENCES.easy.slope, hardSlope: KWT_SEASON_15_WEEK_01_RATING_REFERENCES.hard.slope }
}

async function loadPublishedRatings(client: ReturnType<typeof trustedClient>, courseCodes: string[]) {
  const response = await client.from("handicap_publishable_rating_snapshots").select("course_id,slope").in("course_id", courseCodes)
  if (response.error || (response.data ?? []).length !== 2) return null
  const easySlope = Number(response.data?.find((row) => row.course_id === courseCodes[0])?.slope)
  const hardSlope = Number(response.data?.find((row) => row.course_id === courseCodes[1])?.slope)
  return Number.isFinite(easySlope) && Number.isFinite(hardSlope) ? { easySlope, hardSlope } : null
}

async function resolveViewerCanonicalPlayerId() {
  try {
    const authClient = await createServerSupabaseClient()
    const { data, error } = await authClient.rpc("current_user_canonical_player_id")
    if (error) return null
    const row = Array.isArray(data) ? data[0] : data
    if (typeof row === "string") return row
    if (row && typeof row === "object" && "canonical_player_id" in row && typeof row.canonical_player_id === "string") return row.canonical_player_id
  } catch {
    return null
  }
  return null
}

function publicAllowance(index: PublishedHandicap["resulting_index"], setup: VerifiedWeekSetup) {
  const storedIndex = typeof index === "string" ? Number(index) : index
  const easy = calculateCourseStrokeAllowance(storedIndex, setup.easySlope)
  const hard = calculateCourseStrokeAllowance(storedIndex, setup.hardSlope)
  if (!easy || !hard) return null
  return {
    easy: { strokes: easy.strokes, direction: easy.direction, display: easy.display },
    hard: { strokes: hard.strokes, direction: hard.direction, display: hard.display },
  }
}

function parseWeekSetup(label: string | null, startDate: string | null, endDate: string | null, season: number, week: number, easyCourseCode: string, hardCourseCode: string): KwtWeekSetupMetadata | null {
  if (!label) return null
  try {
    const parsed = JSON.parse(label) as Partial<KwtWeekSetupMetadata>
    return {
      eventIdentifier: typeof parsed.eventIdentifier === "string" ? parsed.eventIdentifier : "",
      season,
      week,
      courseName: typeof parsed.courseName === "string" ? parsed.courseName : "",
      easyCourseCode: typeof parsed.easyCourseCode === "string" ? parsed.easyCourseCode : easyCourseCode,
      hardCourseCode: typeof parsed.hardCourseCode === "string" ? parsed.hardCourseCode : hardCourseCode,
      freezeCutoff: typeof parsed.freezeCutoff === "string" ? parsed.freezeCutoff : "",
    }
  } catch {
    return null
  }
}

