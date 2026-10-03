import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import {
  isSupportedScorecardEvidence,
  safeScorecardEvidenceFilename,
  type ScorecardAdapterKey,
} from "./core"
import type { ScorecardAdapterContext } from "./adapters/contracts"
import { resolveAuthoritativeCourse, type AuthoritativeCourse } from "./courseAuthority"
import { getAuthenticatedDiscordId } from "@/lib/discordPlayerLogin"

type EnabledScorecardAdapterKey = "pyp" | "stroke" | "match"

export const SHARED_SCORECARD_BUCKET = "shared-scorecard-evidence"

export function createScorecardServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Shared scorecard server access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function resolveCanonicalDiscordPlayer(client: SupabaseClient, discordUserId: string) {
  const result = await resolveCanonicalDiscordPlayerResult(client, discordUserId)
  return result.status === "resolved" ? result.playerId : null
}

export async function resolveCanonicalDiscordPlayerResult(client: SupabaseClient, discordUserId: string) {
  if (!/^\d+$/.test(discordUserId)) return { status: "not_found" as const }
  const [players, members] = await Promise.all([
    client.from("players").select("id").eq("discord_id", discordUserId),
    client.from("discord_members").select("player_id").eq("discord_id", discordUserId),
  ])
  if (players.error || members.error) throw new Error("SCORECARD_DISCORD_IDENTITY_FAILED")
  const ids = new Set<string>()
  for (const row of (players.data || []) as Array<{ id: string }>) if (row.id) ids.add(row.id)
  for (const row of (members.data || []) as Array<{ player_id: string | null }>) if (row.player_id) ids.add(row.player_id)
  if (ids.size === 0) return { status: "not_found" as const }
  if (ids.size > 1) return { status: "ambiguous" as const }
  return { status: "resolved" as const, playerId: [...ids][0] }
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

type PypFixture = { id: string; season_id: string; division_number: number; game_number: number; course: string | null; pyp_roster_version_id: string | null; pyp_home_player_id: string | null; pyp_away_player_id: string | null; pyp_home_player_screen_name: string | null; pyp_away_player_screen_name: string | null }
type MatchFixture = { id: string; season_id: string; division_number: number; game_number: number; player1_id: string | null; player2_id: string | null; player1_name: string | null; player2_name: string | null; course: string | null; match_roster_version_id: string | null }

export async function resolvePypScorecardContext(client: SupabaseClient, fixtureId: string, componentKeyInput: string | undefined, courseNameInput: string | undefined): Promise<ScorecardAdapterContext> {
  const componentKey = componentKeyInput === "course1" || componentKeyInput === "course2" ? componentKeyInput : null
  const courseName = courseNameInput?.trim()
  if (!componentKey) throw new Error("SCORECARD_PYP_COMPONENT_INVALID")
  const fixtureResponse = await client.from("schedule").select("id,season_id,division_number,game_number,course,pyp_roster_version_id,pyp_home_player_id,pyp_away_player_id,pyp_home_player_screen_name,pyp_away_player_screen_name").eq("id", fixtureId).eq("league_type", "pyp").maybeSingle()
  if (fixtureResponse.error || !fixtureResponse.data) throw new Error("SCORECARD_PYP_FIXTURE_UNAVAILABLE")
  const fixture = fixtureResponse.data as PypFixture
  if (!fixture.season_id || !fixture.pyp_roster_version_id || !fixture.pyp_home_player_id || !fixture.pyp_away_player_id || fixture.pyp_home_player_id === fixture.pyp_away_player_id) throw new Error("SCORECARD_PYP_FIXTURE_INVALID")
  const [seasonResponse, rosterResponse, resultResponse, coursesResponse] = await Promise.all([
    client.from("seasons").select("id,season_number,is_active").eq("id", fixture.season_id).eq("league_type", "pyp").maybeSingle(),
    client.from("pyp_roster_versions").select("id,season_id,division_count,status").eq("id", fixture.pyp_roster_version_id).in("status", ["approved", "locked"]).maybeSingle(),
    client.from("pyp_managed_results").select("id,course1_name,course2_name").eq("schedule_id", fixture.id).maybeSingle(),
    client.from("all_time_courses").select("id,code,display_name,difficulty,hole_pars,par").eq("active", true).in("difficulty", ["Easy", "Hard"]),
  ])
  if (seasonResponse.error || rosterResponse.error || resultResponse.error || coursesResponse.error || !seasonResponse.data || !rosterResponse.data) throw new Error("SCORECARD_PYP_FIXTURE_AUTHORITY_FAILED")
  if (rosterResponse.data.season_id !== fixture.season_id || fixture.division_number < 1 || fixture.division_number > rosterResponse.data.division_count) throw new Error("SCORECARD_PYP_FIXTURE_NOT_CURRENT")
  if (resultResponse.data?.course1_name && resultResponse.data?.course2_name) throw new Error("SCORECARD_PYP_FIXTURE_COMPLETED")
  const slotsResponse = await client.from("pyp_division_roster_slots").select("player_id,player_screen_name").eq("roster_version_id", rosterResponse.data.id).eq("division_number", fixture.division_number).in("player_id", [fixture.pyp_home_player_id, fixture.pyp_away_player_id])
  if (slotsResponse.error || new Set((slotsResponse.data || []).map((slot) => slot.player_id)).size !== 2) throw new Error("SCORECARD_PYP_ROSTER_UNAVAILABLE")
  const courses = (coursesResponse.data || []) as Array<{ id: string; code: string; display_name: string; difficulty: "Easy" | "Hard"; hole_pars: number[] | null; par: number | null }>
  const configuredCourses = (fixture.course || "").split(/\s*\/\s*/).map((name) => name.trim()).filter(Boolean)
  const resolvedCourseName = courseName || configuredCourses[componentKey === "course1" ? 0 : 1] || ""
  if (!resolvedCourseName) throw new Error("SCORECARD_PYP_COURSE_UNAVAILABLE")
  const matches = courses.filter((course) => course.display_name.trim().toLowerCase() === resolvedCourseName.toLowerCase() || course.code.trim().toLowerCase() === resolvedCourseName.toLowerCase())
  if (matches.length !== 1 || matches[0].hole_pars?.length !== 18 || !Number.isInteger(matches[0].par)) throw new Error("SCORECARD_PYP_COURSE_AUTHORITY_AMBIGUOUS")
  const course = matches[0]
  const names = new Map((slotsResponse.data || []).map((slot) => [slot.player_id, slot.player_screen_name]))
  const component = { key: componentKey, courseId: course.id, courseCode: course.code, courseName: course.display_name, difficulty: course.difficulty, pars: [...course.hole_pars!] }
  return { adapterKey: "pyp", sourceType: "fixture", sourceKey: fixture.id, seasonId: fixture.season_id, seasonNumber: Number(seasonResponse.data.season_number), divisionNumber: fixture.division_number, divisionLabel: `PYP D${fixture.division_number}`, gameNumber: fixture.game_number, roundKey: componentKey, roundLabel: componentKey === "course1" ? "Course 1" : "Course 2", arrangedPlayedDate: null, eventPlayedDate: null, courseId: course.id, courseCode: course.code, courseName: course.display_name, difficulty: course.difficulty, pars: [...course.hole_pars!], participants: [{ roleKey: "home", playerId: fixture.pyp_home_player_id, teamId: null, displayName: names.get(fixture.pyp_home_player_id) || fixture.pyp_home_player_screen_name || "Home" }, { roleKey: "away", playerId: fixture.pyp_away_player_id, teamId: null, displayName: names.get(fixture.pyp_away_player_id) || fixture.pyp_away_player_screen_name || "Away" }], pypComponents: { [componentKey]: component } }
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
    .select("id,code,base_map,display_name,difficulty,hole_pars,par")
    .eq("active", true)
    .in("difficulty", ["Easy", "Hard"])
  if (coursesResponse.error || !fixture.course) throw new Error("SCORECARD_STROKE_COURSE_UNAVAILABLE")
  const course = resolveAuthoritativeCourse(fixture.course, (coursesResponse.data || []) as AuthoritativeCourse[])
  if (!course || course.hole_pars?.length !== 18 || !Number.isInteger(course.par)) {
    throw new Error("SCORECARD_STROKE_COURSE_AUTHORITY_AMBIGUOUS")
  }
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

export async function resolveMatchScorecardContext(client: SupabaseClient, fixtureId: string): Promise<ScorecardAdapterContext> {
  const fixtureResponse = await client.from("schedule").select("id,season_id,division_number,game_number,player1_id,player2_id,player1_name,player2_name,course,match_roster_version_id").eq("id", fixtureId).eq("league_type", "match").maybeSingle()
  if (fixtureResponse.error || !fixtureResponse.data) throw new Error("SCORECARD_MATCH_FIXTURE_UNAVAILABLE")
  const fixture = fixtureResponse.data as MatchFixture
  if (!fixture.season_id || !fixture.match_roster_version_id || !fixture.player1_id || !fixture.player2_id || fixture.player1_id === fixture.player2_id) throw new Error("SCORECARD_MATCH_FIXTURE_INVALID")
  const [seasonResponse, rosterResponse, resultResponse, slotsResponse, coursesResponse] = await Promise.all([
    client.from("seasons").select("id,season_number,is_active").eq("id", fixture.season_id).eq("league_type", "match").maybeSingle(),
    client.from("match_roster_versions").select("id,season_id,division_count,status,created_at").eq("id", fixture.match_roster_version_id).in("status", ["approved", "locked"]).maybeSingle(),
    client.from("results").select("player1_hw,player2_hw").eq("schedule_id", fixture.id).eq("league_type", "match").maybeSingle(),
    client.from("match_division_roster_slots").select("player_id,player_screen_name,slot_status").eq("roster_version_id", fixture.match_roster_version_id).eq("division_number", fixture.division_number).in("player_id", [fixture.player1_id, fixture.player2_id]).eq("slot_status", "active"),
    client.from("all_time_courses").select("id,code,display_name,difficulty,hole_pars,par").eq("active", true).in("difficulty", ["Easy", "Hard"]),
  ])
  if (seasonResponse.error || rosterResponse.error || resultResponse.error || slotsResponse.error || coursesResponse.error || !seasonResponse.data || !rosterResponse.data) throw new Error("SCORECARD_MATCH_FIXTURE_AUTHORITY_FAILED")
  if (resultResponse.data && resultResponse.data.player1_hw !== null && resultResponse.data.player2_hw !== null) throw new Error("SCORECARD_MATCH_FIXTURE_COMPLETED")
  if (rosterResponse.data.season_id !== fixture.season_id || fixture.division_number < 1 || fixture.division_number > rosterResponse.data.division_count) throw new Error("SCORECARD_MATCH_FIXTURE_NOT_CURRENT")
  const slots = (slotsResponse.data || []) as Array<{ player_id: string; player_screen_name: string | null }>
  if (new Set(slots.map((slot) => slot.player_id)).size !== 2) throw new Error("SCORECARD_MATCH_ROSTER_UNAVAILABLE")
  if (!fixture.course) throw new Error("SCORECARD_MATCH_COURSE_UNAVAILABLE")
  const courseName = fixture.course.trim().toLowerCase()
  const matches = (coursesResponse.data || []).filter((course) => course.display_name.trim().toLowerCase() === courseName || course.code.trim().toLowerCase() === courseName) as Array<{ id: string; code: string; display_name: string; difficulty: "Easy" | "Hard"; hole_pars: number[] | null; par: number | null }>
  if (matches.length !== 1 || matches[0].hole_pars?.length !== 18 || !Number.isInteger(matches[0].par)) throw new Error("SCORECARD_MATCH_COURSE_AUTHORITY_AMBIGUOUS")
  const course = matches[0]
  const names = new Map(slots.map((slot) => [slot.player_id, slot.player_screen_name]))
  return { adapterKey: "match", sourceType: "fixture", sourceKey: fixture.id, seasonId: fixture.season_id, seasonNumber: Number(seasonResponse.data.season_number), divisionNumber: fixture.division_number, divisionLabel: `Match D${fixture.division_number}`, gameNumber: fixture.game_number, roundKey: null, roundLabel: null, arrangedPlayedDate: null, eventPlayedDate: null, courseId: course.id, courseCode: course.code, courseName: course.display_name, difficulty: course.difficulty, pars: [...course.hole_pars!], participants: [{ roleKey: "player1", playerId: fixture.player1_id, teamId: null, displayName: names.get(fixture.player1_id) || fixture.player1_name || "Player 1" }, { roleKey: "player2", playerId: fixture.player2_id, teamId: null, displayName: names.get(fixture.player2_id) || fixture.player2_name || "Player 2" }] }
}

export async function resolveScorecardContext(
  client: SupabaseClient,
  adapterKey: ScorecardAdapterKey,
  sourceKey: string,
  componentKey?: string,
  courseName?: string,
) {
  if (adapterKey === "stroke") return resolveStrokeScorecardContext(client, sourceKey)
  if (adapterKey === "pyp") return resolvePypScorecardContext(client, sourceKey, componentKey, courseName)
  if (adapterKey === "match") return resolveMatchScorecardContext(client, sourceKey)
  throw new Error("SCORECARD_ADAPTER_INTAKE_NOT_ENABLED")
}

export async function resolveCanonicalSessionPlayer(client: SupabaseClient, user: { user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown>; identities?: Array<{ provider?: string; identity_data?: Record<string, unknown> }> }) {
  const provider = String(user.app_metadata?.provider || "")
  const providers = Array.isArray(user.app_metadata?.providers) ? user.app_metadata?.providers.map(String) : []
  const hasDiscordIdentity = user.identities?.some((identity) => identity.provider === "discord")
  if (provider !== "discord" && !providers.includes("discord") && !hasDiscordIdentity) return { status: "not_found" as const }
  const discordUserId = getAuthenticatedDiscordId(user) || String(user.user_metadata?.provider_id || user.user_metadata?.sub || "")
  return resolveCanonicalDiscordPlayerResult(client, discordUserId)
}

export type WebsiteScorecardContext = {
  adapterKey: "pyp" | "stroke" | "match"
  sourceKey: string
  seasonNumber: number | null
  divisionNumber: number | null
  gameNumber: number | null
  divisionLabel: string | null
  courseName: string
  difficulty: "Easy" | "Hard"
  opponentLabel: string | null
  submissionComponentKey: string
  participants: Array<{ roleKey: string; playerId: string | null; teamId: string | null; displayName: string; participantMetadata?: Record<string, unknown> }>
  evidence: Array<{ componentKey: string; label: string; reviewStatus: string | null; evidenceId: string | null; signedUrl: string | null }>
}

function roleForPlayer(context: ScorecardAdapterContext, playerId: string) {
  return context.participants.find((participant) => participant.playerId === playerId) || null
}

export async function loadWebsiteScorecardContexts(client: SupabaseClient, playerId: string): Promise<WebsiteScorecardContext[]> {
  const [pypRows, strokeRows, matchRows] = await Promise.all([
    client.from("schedule").select("id").eq("league_type", "pyp").or(`pyp_home_player_id.eq.${playerId},pyp_away_player_id.eq.${playerId}`).order("game_number", { ascending: true }),
    client.from("schedule").select("id").eq("league_type", "stroke").or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`).order("game_number", { ascending: true }),
    client.from("schedule").select("id").eq("league_type", "match").or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`).order("game_number", { ascending: true }),
  ])
  if (pypRows.error || strokeRows.error || matchRows.error) throw new Error("SCORECARD_CONTEXT_LIST_FAILED")
  const contexts: WebsiteScorecardContext[] = []
  const append = async (adapterKey: WebsiteScorecardContext["adapterKey"], sourceKey: string) => {
    try {
      const context = adapterKey === "pyp" ? await resolvePypScorecardContext(client, sourceKey, "course1", undefined) : await resolveScorecardContext(client, adapterKey, sourceKey)
      const memberRole = roleForPlayer(context, playerId)
      if (!memberRole) return
      const persisted = await client.from("shared_scorecard_contexts").select("id").eq("adapter_key", adapterKey).eq("source_key", sourceKey).maybeSingle()
      if (persisted.error) throw persisted.error
      const evidenceRows = persisted.data ? await client.from("shared_scorecard_evidence").select("id,component_key,review_status,storage_path").eq("context_id", persisted.data.id).in("review_status", ["uploading", "submitted", "under_review", "reopened", "verified"]) : { data: [], error: null }
      if (evidenceRows.error) throw evidenceRows.error
      let expected: Array<{ componentKey: string; label: string }>
      if (adapterKey === "pyp") {
        const course2 = await resolvePypScorecardContext(client, sourceKey, "course2", undefined)
        expected = [{ componentKey: "course1", label: `Course 1 · ${context.courseName} ${context.difficulty}` }, { componentKey: "course2", label: `Course 2 · ${course2.courseName} ${course2.difficulty}` }]
      } else {
        const componentKey = "primary"
        expected = [{ componentKey, label: `${context.courseName} ${context.difficulty}` }]
      }
      const opponentLabel = context.participants.filter((participant) => participant.roleKey !== memberRole?.roleKey).map((participant) => participant.displayName).join(" vs ") || null
      const evidence = await Promise.all(expected.map(async (slot) => {
        const row = (evidenceRows.data || []).find((item) => item.component_key === slot.componentKey) as { id?: string; review_status?: string; storage_path?: string } | undefined
        let signedUrl: string | null = null
        if (row?.storage_path && row.review_status !== "replaced") {
          const signed = await client.storage.from(SHARED_SCORECARD_BUCKET).createSignedUrl(row.storage_path, 900)
          if (!signed.error) signedUrl = signed.data.signedUrl
        }
        return { ...slot, reviewStatus: row?.review_status || null, evidenceId: row?.id || null, signedUrl }
      }))
      contexts.push({ adapterKey, sourceKey, seasonNumber: context.seasonNumber, divisionNumber: context.divisionNumber, gameNumber: context.gameNumber, divisionLabel: context.divisionLabel, courseName: context.courseName, difficulty: context.difficulty, opponentLabel, submissionComponentKey: adapterKey === "pyp" ? "course1" : "primary", participants: context.participants, evidence })
    } catch { /* Current roster/result guards intentionally hide stale or completed games. */ }
  }
  for (const row of (pypRows.data || []) as Array<{ id: string }>) await append("pyp", row.id)
  for (const row of (strokeRows.data || []) as Array<{ id: string }>) await append("stroke", row.id)
  for (const row of (matchRows.data || []) as Array<{ id: string }>) await append("match", row.id)
  return contexts
}

export async function storeWebsiteScorecardEvidence(options: { client: SupabaseClient; playerId: string; adapterKey: "pyp" | "stroke" | "match"; sourceKey: string; componentKey?: string; filename: string; contentType: string; bytes: Uint8Array; action?: "upload" | "replace"; expectedEvidenceId?: string }) {
  if (!isSupportedScorecardEvidence(options.contentType, options.bytes.byteLength)) return { stored: false as const, reason: "invalid_image" as const }
  const context = options.adapterKey === "pyp" ? await resolvePypScorecardContext(options.client, options.sourceKey, options.componentKey, undefined) : await resolveScorecardContext(options.client, options.adapterKey, options.sourceKey)
  const participant = roleForPlayer(context, options.playerId)
  if (!participant) return { stored: false as const, reason: "not_participant" as const }
  const componentKey = options.adapterKey === "pyp" ? options.componentKey || "" : "primary"
  if (!componentKey || (options.adapterKey === "pyp" && componentKey !== "course1" && componentKey !== "course2")) return { stored: false as const, reason: "component_required" as const }
  const persisted = await ensureSharedScorecardContext(options.client, context)
  const existing = await options.client.from("shared_scorecard_evidence").select("id,review_status,sha256,storage_path").eq("context_id", persisted.contextId).eq("component_key", componentKey).in("review_status", ["uploading", "submitted", "under_review", "reopened", "verified"]).limit(1)
  if (existing.error) throw new Error("SCORECARD_DUPLICATE_CHECK_FAILED")
  const currentEvidence = (existing.data || [])[0] as { id?: string; review_status?: string; sha256?: string } | undefined
  if (currentEvidence && options.action !== "replace") return { stored: false as const, reason: "already_submitted" as const }
  if (options.action === "replace" && options.expectedEvidenceId && currentEvidence?.id !== options.expectedEvidenceId) return { stored: false as const, reason: "evidence_changed" as const }
  if (options.action === "replace" && currentEvidence) return replaceScorecardEvidence({ ...options, contextId: persisted.contextId, componentKey, previousEvidence: currentEvidence, submittedByPlayerId: options.playerId, submittedByDiscordUserId: null })
  const evidenceId = randomUUID()
  const storagePath = `${options.adapterKey}/${persisted.contextId}/${componentKey}/${evidenceId}-${safeScorecardEvidenceFilename(options.filename, options.contentType)}`
  const reservation = await options.client.from("shared_scorecard_evidence").insert({ id: evidenceId, context_id: persisted.contextId, component_key: componentKey, submitted_by_player_id: options.playerId, submitted_by_discord_user_id: null, submission_source: "website_player", storage_path: storagePath, original_filename: options.filename.slice(0, 255), content_type: options.contentType.toLowerCase(), file_size_bytes: options.bytes.byteLength, sha256: createHash("sha256").update(options.bytes).digest("hex"), review_status: "uploading" })
  if (reservation.error) { if (reservation.error.code === "23505") return { stored: false as const, reason: "already_submitted" as const }; throw new Error("SCORECARD_EVIDENCE_RESERVATION_FAILED") }
  const upload = await options.client.storage.from(SHARED_SCORECARD_BUCKET).upload(storagePath, options.bytes, { contentType: options.contentType.toLowerCase(), cacheControl: "3600", upsert: false })
  if (upload.error) { await options.client.from("shared_scorecard_evidence").update({ review_status: "upload_failed" }).eq("id", evidenceId); throw new Error("SCORECARD_EVIDENCE_STORAGE_FAILED") }
  const complete = await options.client.from("shared_scorecard_evidence").update({ review_status: "submitted", submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", evidenceId).eq("review_status", "uploading")
  if (complete.error) throw new Error("SCORECARD_EVIDENCE_FINALIZE_FAILED")
  return { stored: true as const, evidenceId, adapterKey: options.adapterKey, sourceKey: options.sourceKey, componentKey, status: "submitted" as const }
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
    participant_metadata: participant.participantMetadata || {},
    display_name_snapshot: participant.displayName,
  }))
  const participantResponse = await client.from("shared_scorecard_participants").upsert(
    participants,
    { onConflict: "context_id,role_key" },
  ).select("id,role_key,player_id,team_id,display_name_snapshot")
  if (participantResponse.error) throw new Error("SCORECARD_PARTICIPANTS_SAVE_FAILED")
  if (context.adapterKey === "pyp" && context.pypComponents) {
    const components = [context.pypComponents.course1, context.pypComponents.course2].filter(Boolean)
    const componentResponse = await client.from("shared_scorecard_context_components").upsert(components.map((component) => ({ context_id: contextResponse.data.id, component_key: component!.key, course_id: component!.courseId, course_code: component!.courseCode, course_name_snapshot: component!.courseName, difficulty: component!.difficulty, par_snapshot: component!.pars, total_par: component!.pars.reduce((sum, par) => sum + par, 0), updated_at: new Date().toISOString() })), { onConflict: "context_id,component_key" })
    if (componentResponse.error) throw new Error("SCORECARD_COMPONENTS_SAVE_FAILED")
  }
  return { contextId, participants: participantResponse.data || [] }
}

type EvidenceReplacementOptions = {
  client: SupabaseClient
  adapterKey: EnabledScorecardAdapterKey
  sourceKey: string
  contextId: string
  componentKey: string
  filename: string
  contentType: string
  bytes: Uint8Array
  previousEvidence: { id?: string; review_status?: string; sha256?: string }
  submittedByPlayerId: string | null
  submittedByDiscordUserId: string | null
  seasonId?: string | null
  divisionNumber?: number | null
}

async function replaceScorecardEvidence(options: EvidenceReplacementOptions) {
  const previousId = options.previousEvidence.id
  const previousStatus = options.previousEvidence.review_status
  if (!previousId || !previousStatus) return { stored: false as const, reason: "already_submitted" as const }
  if (previousStatus === "verified") return { stored: false as const, reason: "verified_locked" as const }
  const sha256 = createHash("sha256").update(options.bytes).digest("hex")
  if (options.previousEvidence.sha256 === sha256) return { stored: false as const, reason: "already_submitted" as const }
  const evidenceId = randomUUID()
  const auditId = randomUUID()
  const safeName = safeScorecardEvidenceFilename(options.filename, options.contentType)
  const storagePath = `${options.adapterKey}/${options.contextId}/${options.componentKey}/${evidenceId}-${safeName}`
  const now = new Date().toISOString()
  const retired = await options.client.from("shared_scorecard_evidence").update({ review_status: "replaced", replaced_from_status: previousStatus, replaced_at: now }).eq("id", previousId).eq("context_id", options.contextId).in("review_status", ["submitted", "under_review", "reopened"]).select("id")
  if (retired.error) throw new Error("SCORECARD_EVIDENCE_REPLACEMENT_FAILED")
  if (!(retired.data || []).length) return { stored: false as const, reason: "evidence_changed" as const }
  const reservation = await options.client.from("shared_scorecard_evidence").insert({
    id: evidenceId,
    context_id: options.contextId,
    component_key: options.componentKey,
    submitted_by_player_id: options.submittedByPlayerId,
    submitted_by_discord_user_id: options.submittedByDiscordUserId,
    submission_source: options.submittedByDiscordUserId ? "discord_player" : "website_player",
    storage_path: storagePath,
    original_filename: options.filename.slice(0, 255),
    content_type: options.contentType.toLowerCase(),
    file_size_bytes: options.bytes.byteLength,
    sha256,
    review_status: "uploading",
  })
  if (reservation.error) {
    await options.client.from("shared_scorecard_evidence").update({ review_status: previousStatus, replaced_from_status: null, replaced_at: null }).eq("id", previousId).eq("review_status", "replaced")
    if (reservation.error.code === "23505") return { stored: false as const, reason: "already_submitted" as const }
    throw new Error("SCORECARD_EVIDENCE_REPLACEMENT_FAILED")
  }
  const audit = await options.client.from("shared_scorecard_evidence_replacements").insert({ id: auditId, context_id: options.contextId, component_key: options.componentKey, previous_evidence_id: previousId, new_evidence_id: evidenceId, replaced_by_player_id: options.submittedByPlayerId, replaced_by_discord_user_id: options.submittedByDiscordUserId, previous_review_status: previousStatus, replacement_status: "reserved" })
  if (audit.error) {
    await options.client.from("shared_scorecard_evidence").update({ review_status: "upload_failed" }).eq("id", evidenceId)
    await options.client.from("shared_scorecard_evidence").update({ review_status: previousStatus, replaced_from_status: null, replaced_at: null }).eq("id", previousId).eq("review_status", "replaced")
    throw new Error("SCORECARD_EVIDENCE_REPLACEMENT_FAILED")
  }
  await options.client.from("shared_scorecard_evidence").update({ replaced_by_evidence_id: evidenceId, replacement_audit_id: auditId }).eq("id", previousId)
  const upload = await options.client.storage.from(SHARED_SCORECARD_BUCKET).upload(storagePath, options.bytes, { contentType: options.contentType.toLowerCase(), cacheControl: "3600", upsert: false })
  if (upload.error) {
    await options.client.from("shared_scorecard_evidence").update({ review_status: "upload_failed" }).eq("id", evidenceId)
    await options.client.from("shared_scorecard_evidence_replacements").update({ replacement_status: "rolled_back" }).eq("id", auditId)
    await options.client.from("shared_scorecard_evidence").update({ review_status: previousStatus, replaced_by_evidence_id: null, replacement_audit_id: null, replaced_from_status: null, replaced_at: null }).eq("id", previousId).eq("review_status", "replaced")
    throw new Error("SCORECARD_EVIDENCE_STORAGE_FAILED")
  }
  const complete = await options.client.from("shared_scorecard_evidence").update({ review_status: "submitted", submitted_at: now, updated_at: now }).eq("id", evidenceId).eq("review_status", "uploading")
  if (complete.error) throw new Error("SCORECARD_EVIDENCE_FINALIZE_FAILED")
  await options.client.from("shared_scorecard_evidence_replacements").update({ replacement_status: "completed", completed_at: new Date().toISOString() }).eq("id", auditId).eq("replacement_status", "reserved")
  return { stored: true as const, replaced: true as const, evidenceId, adapterKey: options.adapterKey, sourceKey: options.sourceKey, componentKey: options.componentKey, seasonId: options.seasonId, divisionNumber: options.divisionNumber, status: "submitted" as const }
}

export async function loadDiscordScorecardState(options: {
  client: SupabaseClient
  adapterKey: EnabledScorecardAdapterKey
  sourceKey: string
  discordUserId: string
  componentKey?: string
  courseName?: string
}) {
  const playerId = await resolveCanonicalDiscordPlayer(options.client, options.discordUserId)
  if (!playerId) return { authorized: false as const, reason: "identity_unavailable" as const }
  const context = options.adapterKey === "pyp" ? await resolvePypScorecardContext(options.client, options.sourceKey, options.componentKey, options.courseName) : await resolveScorecardContext(options.client, options.adapterKey, options.sourceKey)
  if (!context.participants.some((participant) => participant.playerId === playerId)) return { authorized: false as const, reason: "not_participant" as const }
  const componentKey = options.adapterKey === "pyp" ? options.componentKey || "" : "primary"
  if (!componentKey) return { authorized: false as const, reason: "component_required" as const }
  const persisted = await ensureSharedScorecardContext(options.client, context)
  const existing = await options.client.from("shared_scorecard_evidence").select("id,review_status,storage_path,sha256").eq("context_id", persisted.contextId).eq("component_key", componentKey).in("review_status", ["uploading", "submitted", "under_review", "reopened", "verified"]).limit(1)
  if (existing.error) throw new Error("SCORECARD_DUPLICATE_CHECK_FAILED")
  const evidence = ((existing.data || [])[0] || null) as { id: string; review_status: string; storage_path: string; sha256: string } | null
  return { authorized: true as const, playerId, context, componentKey, contextId: persisted.contextId, evidence }
}

export async function authorizeDiscordScorecard(options: {
  client: SupabaseClient
  adapterKey: EnabledScorecardAdapterKey
  sourceKey: string
  discordUserId: string
  componentKey?: string
  courseName?: string
}) {
  const state = await loadDiscordScorecardState(options)
  if (!state.authorized) return state
  if (state.evidence) return { authorized: false as const, reason: state.evidence.review_status === "verified" ? "verified_locked" as const : "already_submitted" as const }
  return state
}

export async function storeDiscordScorecardEvidence(options: {
  client: SupabaseClient
  adapterKey: EnabledScorecardAdapterKey
  sourceKey: string
  discordUserId: string
  filename: string
  contentType: string
  bytes: Uint8Array
  componentKey?: string
  courseName?: string
  action?: "upload" | "replace"
  expectedEvidenceId?: string
}) {
  if (!isSupportedScorecardEvidence(options.contentType, options.bytes.byteLength)) {
    return { stored: false as const, reason: "invalid_image" as const }
  }
  const state = await loadDiscordScorecardState(options)
  if (!state.authorized) return { stored: false as const, reason: state.reason }
  if (options.action === "replace") {
    if (options.expectedEvidenceId && state.evidence?.id !== options.expectedEvidenceId) return { stored: false as const, reason: "evidence_changed" as const }
    if (!state.evidence) return { stored: false as const, reason: "not_submitted" as const }
    return replaceScorecardEvidence({ ...options, contextId: state.contextId, componentKey: state.componentKey, previousEvidence: state.evidence, submittedByPlayerId: state.playerId, submittedByDiscordUserId: options.discordUserId, seasonId: state.context.seasonId, divisionNumber: state.context.divisionNumber })
  }
  if (state.evidence) return { stored: false as const, reason: state.evidence.review_status === "verified" ? "verified_locked" as const : "already_submitted" as const }
  const evidenceId = randomUUID()
  const safeName = safeScorecardEvidenceFilename(options.filename, options.contentType)
  const componentKey = state.componentKey
  const storagePath = `${options.adapterKey}/${state.contextId}/${componentKey}/${evidenceId}-${safeName}`
  const sha256 = createHash("sha256").update(options.bytes).digest("hex")
  const reservation = await options.client.from("shared_scorecard_evidence").insert({
    id: evidenceId,
    context_id: state.contextId,
    component_key: componentKey,
    submitted_by_player_id: state.playerId,
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
  return {
    stored: true as const,
    evidenceId,
    adapterKey: options.adapterKey,
    sourceKey: options.sourceKey,
    componentKey,
    seasonId: state.context.seasonId,
    divisionNumber: state.context.divisionNumber,
    status: "submitted" as const,
  }
}
