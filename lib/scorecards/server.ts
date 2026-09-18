import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import {
  isSupportedScorecardEvidence,
  safeScorecardEvidenceFilename,
  type ScorecardAdapterKey,
} from "./core"
import type { ScorecardAdapterContext } from "./adapters/contracts"

export const SHARED_SCORECARD_BUCKET = "shared-scorecard-evidence"

export function createScorecardServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Shared scorecard server access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function resolveCanonicalDiscordPlayer(client: SupabaseClient, discordUserId: string) {
  if (!/^\d+$/.test(discordUserId)) return null
  const [players, members] = await Promise.all([
    client.from("players").select("id").eq("discord_id", discordUserId),
    client.from("discord_members").select("player_id").eq("discord_id", discordUserId),
  ])
  if (players.error || members.error) throw new Error("SCORECARD_DISCORD_IDENTITY_FAILED")
  const ids = new Set<string>()
  for (const row of (players.data || []) as Array<{ id: string }>) if (row.id) ids.add(row.id)
  for (const row of (members.data || []) as Array<{ player_id: string | null }>) if (row.player_id) ids.add(row.player_id)
  return ids.size === 1 ? [...ids][0] : null
}

type StrokeFixture = {
  id: string
  season_id: string
  division_number: number
  game_number: number
  player1_id: string
  player2_id: string
  player1_name: string | null
  player2_name: string | null
  course: string | null
  roster_version_id: string | null
}

export async function resolveStrokeScorecardContext(
  client: SupabaseClient,
  fixtureId: string,
): Promise<ScorecardAdapterContext> {
  const fixtureResponse = await client
    .from("schedule")
    .select("id,season_id,division_number,game_number,player1_id,player2_id,player1_name,player2_name,course,roster_version_id")
    .eq("id", fixtureId)
    .eq("league_type", "stroke")
    .maybeSingle()
  if (fixtureResponse.error || !fixtureResponse.data) throw new Error("SCORECARD_STROKE_FIXTURE_UNAVAILABLE")
  const fixture = fixtureResponse.data as StrokeFixture

  const [seasonResponse, rosterResponse] = await Promise.all([
    client.from("seasons").select("id,season_number").eq("id", fixture.season_id).eq("league_type", "stroke").maybeSingle(),
    client.from("stroke_roster_versions").select("id,season_id,division_count,status,created_at").eq("status", "approved").order("created_at", { ascending: false }),
  ])
  if (seasonResponse.error || rosterResponse.error || !seasonResponse.data) throw new Error("SCORECARD_STROKE_SEASON_UNAVAILABLE")
  const rosters = (rosterResponse.data || []) as Array<{ id: string; season_id: string; division_count: number }>
  const currentRoster = rosters[0]
  if (!currentRoster || currentRoster.season_id !== fixture.season_id || fixture.roster_version_id !== currentRoster.id) {
    throw new Error("SCORECARD_STROKE_FIXTURE_NOT_CURRENT")
  }
  if (fixture.division_number < 1 || fixture.division_number > currentRoster.division_count) {
    throw new Error("SCORECARD_STROKE_DIVISION_NOT_CURRENT")
  }

  const slotsResponse = await client
    .from("stroke_division_roster_slots")
    .select("player_id,player_screen_name")
    .eq("roster_version_id", currentRoster.id)
    .eq("division_number", fixture.division_number)
    .in("player_id", [fixture.player1_id, fixture.player2_id])
  if (slotsResponse.error) throw new Error("SCORECARD_STROKE_ROSTER_UNAVAILABLE")
  const slots = (slotsResponse.data || []) as Array<{ player_id: string; player_screen_name: string | null }>
  if (new Set(slots.map((slot) => slot.player_id)).size !== 2) throw new Error("SCORECARD_STROKE_PARTICIPANTS_NOT_ROSTERED")

  const coursesResponse = await client
    .from("all_time_courses")
    .select("id,code,display_name,difficulty,hole_pars,par")
    .eq("active", true)
    .in("difficulty", ["Easy", "Hard"])
  if (coursesResponse.error || !fixture.course) throw new Error("SCORECARD_STROKE_COURSE_UNAVAILABLE")
  const courseName = fixture.course.trim().toLowerCase()
  const courses = (coursesResponse.data || []) as Array<{
    id: string
    code: string
    display_name: string
    difficulty: "Easy" | "Hard"
    hole_pars: number[] | null
    par: number | null
  }>
  const matches = courses.filter((course) =>
    course.display_name.trim().toLowerCase() === courseName || course.code.trim().toLowerCase() === courseName,
  )
  if (matches.length !== 1 || matches[0].hole_pars?.length !== 18 || !Number.isInteger(matches[0].par)) {
    throw new Error("SCORECARD_STROKE_COURSE_AUTHORITY_AMBIGUOUS")
  }
  const course = matches[0]
  const names = new Map(slots.map((slot) => [slot.player_id, slot.player_screen_name]))
  return {
    adapterKey: "stroke",
    sourceType: "fixture",
    sourceKey: fixture.id,
    seasonId: fixture.season_id,
    seasonNumber: Number(seasonResponse.data.season_number),
    divisionNumber: fixture.division_number,
    divisionLabel: `Stroke D${fixture.division_number}`,
    gameNumber: fixture.game_number,
    roundKey: null,
    roundLabel: null,
    arrangedPlayedDate: null,
    eventPlayedDate: null,
    courseId: course.id,
    courseCode: course.code,
    courseName: course.display_name,
    difficulty: course.difficulty,
    pars: [...course.hole_pars!],
    participants: [
      { roleKey: "player1", playerId: fixture.player1_id, teamId: null, displayName: names.get(fixture.player1_id) || fixture.player1_name || "Player 1" },
      { roleKey: "player2", playerId: fixture.player2_id, teamId: null, displayName: names.get(fixture.player2_id) || fixture.player2_name || "Player 2" },
    ],
  }
}

export async function resolveScorecardContext(
  client: SupabaseClient,
  adapterKey: ScorecardAdapterKey,
  sourceKey: string,
) {
  if (adapterKey === "stroke") return resolveStrokeScorecardContext(client, sourceKey)
  throw new Error("SCORECARD_ADAPTER_INTAKE_NOT_ENABLED")
}

export async function ensureSharedScorecardContext(client: SupabaseClient, context: ScorecardAdapterContext) {
  const contextResponse = await client.from("shared_scorecard_contexts").upsert({
    adapter_key: context.adapterKey,
    source_type: context.sourceType,
    source_key: context.sourceKey,
    season_id: context.seasonId,
    season_number: context.seasonNumber,
    division_number: context.divisionNumber,
    division_label: context.divisionLabel,
    game_number: context.gameNumber,
    round_key: context.roundKey,
    round_label: context.roundLabel,
    arranged_played_date: context.arrangedPlayedDate,
    event_played_date: context.eventPlayedDate,
    course_id: context.courseId,
    course_code: context.courseCode,
    course_name_snapshot: context.courseName,
    difficulty: context.difficulty,
    par_snapshot: context.pars,
    total_par: context.pars.reduce((sum, par) => sum + par, 0),
    context_metadata: {},
    updated_at: new Date().toISOString(),
  }, { onConflict: "adapter_key,source_type,source_key" }).select("id").single()
  if (contextResponse.error) throw new Error("SCORECARD_CONTEXT_SAVE_FAILED")
  const contextId = String(contextResponse.data.id)
  const participants = context.participants.map((participant) => ({
    context_id: contextId,
    role_key: participant.roleKey,
    subject_type: participant.playerId ? "player" : "team",
    player_id: participant.playerId,
    team_id: participant.teamId,
    display_name_snapshot: participant.displayName,
  }))
  const participantResponse = await client.from("shared_scorecard_participants").upsert(
    participants,
    { onConflict: "context_id,role_key" },
  ).select("id,role_key,player_id,team_id,display_name_snapshot")
  if (participantResponse.error) throw new Error("SCORECARD_PARTICIPANTS_SAVE_FAILED")
  return { contextId, participants: participantResponse.data || [] }
}

export async function authorizeDiscordScorecard(options: {
  client: SupabaseClient
  adapterKey: ScorecardAdapterKey
  sourceKey: string
  discordUserId: string
}) {
  const playerId = await resolveCanonicalDiscordPlayer(options.client, options.discordUserId)
  if (!playerId) return { authorized: false as const, reason: "identity_unavailable" as const }
  const context = await resolveScorecardContext(options.client, options.adapterKey, options.sourceKey)
  if (!context.participants.some((participant) => participant.playerId === playerId)) {
    return { authorized: false as const, reason: "not_participant" as const }
  }
  const persisted = await ensureSharedScorecardContext(options.client, context)
  const existing = await options.client
    .from("shared_scorecard_evidence")
    .select("id")
    .eq("context_id", persisted.contextId)
    .in("review_status", ["uploading", "submitted", "under_review", "verified"])
    .limit(1)
  if (existing.error) throw new Error("SCORECARD_DUPLICATE_CHECK_FAILED")
  if ((existing.data || []).length > 0) return { authorized: false as const, reason: "already_submitted" as const }
  return { authorized: true as const, playerId, context, ...persisted }
}

export async function storeDiscordScorecardEvidence(options: {
  client: SupabaseClient
  adapterKey: ScorecardAdapterKey
  sourceKey: string
  discordUserId: string
  filename: string
  contentType: string
  bytes: Uint8Array
}) {
  if (!isSupportedScorecardEvidence(options.contentType, options.bytes.byteLength)) {
    return { stored: false as const, reason: "invalid_image" as const }
  }
  const authorization = await authorizeDiscordScorecard(options)
  if (!authorization.authorized) return { stored: false as const, reason: authorization.reason }
  const evidenceId = randomUUID()
  const safeName = safeScorecardEvidenceFilename(options.filename, options.contentType)
  const storagePath = `${options.adapterKey}/${authorization.contextId}/${evidenceId}-${safeName}`
  const sha256 = createHash("sha256").update(options.bytes).digest("hex")
  const reservation = await options.client.from("shared_scorecard_evidence").insert({
    id: evidenceId,
    context_id: authorization.contextId,
    submitted_by_player_id: authorization.playerId,
    submitted_by_discord_user_id: options.discordUserId,
    submission_source: "discord_player",
    storage_path: storagePath,
    original_filename: options.filename.slice(0, 255),
    content_type: options.contentType.toLowerCase(),
    file_size_bytes: options.bytes.byteLength,
    sha256,
    review_status: "uploading",
  })
  if (reservation.error) {
    if (reservation.error.code === "23505") return { stored: false as const, reason: "already_submitted" as const }
    throw new Error("SCORECARD_EVIDENCE_RESERVATION_FAILED")
  }
  const upload = await options.client.storage.from(SHARED_SCORECARD_BUCKET).upload(storagePath, options.bytes, {
    contentType: options.contentType.toLowerCase(),
    cacheControl: "3600",
    upsert: false,
  })
  if (upload.error) {
    await options.client.from("shared_scorecard_evidence").update({ review_status: "upload_failed" }).eq("id", evidenceId)
    throw new Error("SCORECARD_EVIDENCE_STORAGE_FAILED")
  }
  const complete = await options.client.from("shared_scorecard_evidence").update({
    review_status: "submitted",
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", evidenceId).eq("review_status", "uploading")
  if (complete.error) throw new Error("SCORECARD_EVIDENCE_FINALIZE_FAILED")
  return { stored: true as const, evidenceId, adapterKey: options.adapterKey, sourceKey: options.sourceKey }
}
