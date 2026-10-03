import { NextResponse } from "next/server"
import { authorizeDoublesParticipant, createDoublesRuntimeClient } from "@/lib/doublesParticipantServer"
import { provisionalDoublesState, validateDoublesHoleRow } from "@/lib/doublesMatchPlay"

type CourseSlot = "HOME_TEAM_COURSE" | "AWAY_TEAM_COURSE"

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
}

function isCourseSlot(value: unknown): value is CourseSlot {
  return value === "HOME_TEAM_COURSE" || value === "AWAY_TEAM_COURSE"
}

async function loadWorkspace(fixtureId: string) {
  const authorization = await authorizeDoublesParticipant(fixtureId)
  if (!authorization.authorized) return authorization
  const { client, fixture, participantId } = authorization
  const teamIds = [fixture.home_season_team_id, fixture.away_season_team_id]
  const [teams, members, drafts, evidence, result, arrangement] = await Promise.all([
    client.from("doubles_managed_season_teams").select("id,team_name_snapshot,division,order_position").in("id", teamIds),
    client.from("doubles_season_team_members").select("season_team_id,player_id").in("season_team_id", teamIds).eq("season_id", fixture.season_id).in("role", ["MEMBER", "member"]).eq("active", true).is("effective_to", null),
    client.from("doubles_team_course_drafts").select("id,fixture_id,season_team_id,course_slot,course_name,player_one_id,player_two_id,player_one_holes,player_two_holes,home_holes_won,away_holes_won,status,submitted_by,submitted_at,updated_by,updated_at").eq("fixture_id", fixtureId),
    client.from("doubles_course_evidence").select("id,fixture_id,course_slot,original_filename,content_type,status,uploaded_by,uploaded_at,reviewed_at").eq("fixture_id", fixtureId),
    client.from("doubles_managed_results").select("*").eq("fixture_id", fixtureId).maybeSingle(),
    client.from("doubles_arrangements").select("fixture_id,proposed_for,accepted_for,proposed_by,accepted_by,state,updated_at").eq("fixture_id", fixtureId).maybeSingle(),
  ])
  if (teams.error || members.error || drafts.error || evidence.error || result.error || arrangement.error) return { authorized: false as const, status: 503, message: "Doubles workspace is temporarily unavailable." }
  const playerIds = Array.from(new Set((members.data || []).map((row) => row.player_id)))
  const players = await client.from("players").select("id,screen_name").in("id", playerIds)
  if (players.error) return { authorized: false as const, status: 503, message: "Doubles player names are temporarily unavailable." }
  const names = new Map((players.data || []).map((row) => [row.id, row.screen_name]))
  const teamById = new Map((teams.data || []).map((row) => [row.id, row]))
  const membersByTeam = new Map<string, Array<{ id: string; screen_name: string }>>()
  for (const member of members.data || []) {
    const list = membersByTeam.get(member.season_team_id) || []
    list.push({ id: member.player_id, screen_name: names.get(member.player_id) || "Player" })
    membersByTeam.set(member.season_team_id, list)
  }
  const homeTeam = teamById.get(fixture.home_season_team_id)
  const awayTeam = teamById.get(fixture.away_season_team_id)
  const callerTeamId = members.data?.find((row) => row.player_id === participantId)?.season_team_id || null
  const allDrafts = drafts.data || []
  const homeSubmitted = allDrafts.filter((draft) => draft.season_team_id === fixture.home_season_team_id && draft.status === "SUBMITTED").length === 2
  const awaySubmitted = allDrafts.filter((draft) => draft.season_team_id === fixture.away_season_team_id && draft.status === "SUBMITTED").length === 2
  const homeOverall = allDrafts.filter((draft) => draft.season_team_id === fixture.home_season_team_id && draft.status === "SUBMITTED").reduce((sum, draft) => sum + Number(draft.home_holes_won || 0), 0)
  const awayOverall = allDrafts.filter((draft) => draft.season_team_id === fixture.away_season_team_id && draft.status === "SUBMITTED").reduce((sum, draft) => sum + Number(draft.away_holes_won || 0), 0)
  const state = result.data?.status === "VERIFIED" || result.data?.status === "OVERRIDDEN"
    ? "VERIFIED"
    : provisionalDoublesState({ homeSubmitted, awaySubmitted, homeCourseComplete: allDrafts.filter((draft) => draft.course_slot === "HOME_TEAM_COURSE" && draft.status === "SUBMITTED").length === 2, awayCourseComplete: allDrafts.filter((draft) => draft.course_slot === "AWAY_TEAM_COURSE" && draft.status === "SUBMITTED").length === 2, homeOverall: homeSubmitted ? homeOverall : null, awayOverall: awaySubmitted ? awayOverall : null })
  return { authorized: true as const, payload: { fixture, participantId, callerTeamId, homeTeam: { ...homeTeam, members: membersByTeam.get(fixture.home_season_team_id) || [] }, awayTeam: { ...awayTeam, members: membersByTeam.get(fixture.away_season_team_id) || [] }, drafts: allDrafts, evidence: evidence.data || [], arrangement: arrangement.data, result: result.data, state } }
}

export async function GET(request: Request) {
  const fixtureId = new URL(request.url).searchParams.get("fixture_id")
  if (!fixtureId) return error("fixture_id is required")
  const loaded = await loadWorkspace(fixtureId)
  if (!loaded.authorized) return error(loaded.message, loaded.status)
  return NextResponse.json(loaded.payload)
}

export async function POST(request: Request) {
  let body: { fixture_id?: string; action?: "save_draft" | "submit"; course_slot?: CourseSlot; player_one_holes?: unknown; player_two_holes?: unknown; home_holes_won?: unknown; away_holes_won?: unknown }
  try { body = await request.json() } catch { return error("Invalid Doubles team submission") }
  if (!body.fixture_id || !isCourseSlot(body.course_slot) || !body.action) return error("Fixture, course slot and action are required")
  const loaded = await loadWorkspace(body.fixture_id)
  if (!loaded.authorized) return error(loaded.message, loaded.status)
  const { payload } = loaded
  const client = createDoublesRuntimeClient()
  const teamId = payload.callerTeamId
  if (!teamId) return error("The signed-in player is not assigned to this fixture", 403)
  const team = teamId === payload.fixture.home_season_team_id ? payload.homeTeam : payload.awayTeam
  const members = team.members || []
  if (members.length !== 2) return error("The fixture team roster is incomplete", 409)
  const playerOneHoles = Array.isArray(body.player_one_holes) ? body.player_one_holes : []
  const playerTwoHoles = Array.isArray(body.player_two_holes) ? body.player_two_holes : []
  const isFullSubmission = body.action === "submit"
  if (isFullSubmission && (!validateDoublesHoleRow(playerOneHoles) || !validateDoublesHoleRow(playerTwoHoles))) return error("Each team member needs exactly 18 holes containing only 0 or 1")
  if (!isFullSubmission && ([...playerOneHoles, ...playerTwoHoles].some((value) => value !== 0 && value !== 1) || playerOneHoles.length > 18 || playerTwoHoles.length > 18)) return error("Draft holes must be 0 or 1")
  const homeHolesWon = body.home_holes_won === undefined || body.home_holes_won === "" ? null : Number(body.home_holes_won)
  const awayHolesWon = body.away_holes_won === undefined || body.away_holes_won === "" ? null : Number(body.away_holes_won)
  if (isFullSubmission && [homeHolesWon, awayHolesWon].some((value) => value === null || !Number.isInteger(value) || value < 0 || value > 18)) return error("Both actual holes-won values are required")
  const courseName = body.course_slot === "HOME_TEAM_COURSE" ? payload.fixture.home_course : payload.fixture.away_course
  const existing = payload.drafts.find((draft) => draft.season_team_id === teamId && draft.course_slot === body.course_slot)
  const nextStatus = isFullSubmission ? "SUBMITTED" : existing?.status === "SUBMITTED" ? "SUBMITTED" : "DRAFT"
  const saved = await client.from("doubles_team_course_drafts").upsert({ fixture_id: body.fixture_id, season_team_id: teamId, course_slot: body.course_slot, course_name: courseName, player_one_id: members[0].id, player_two_id: members[1].id, player_one_holes: playerOneHoles, player_two_holes: playerTwoHoles, home_holes_won: homeHolesWon, away_holes_won: awayHolesWon, status: nextStatus, submitted_by: isFullSubmission ? payload.participantId : existing?.submitted_by || null, submitted_at: isFullSubmission ? new Date().toISOString() : existing?.submitted_at || null, updated_by: payload.participantId, updated_at: new Date().toISOString() }, { onConflict: "fixture_id,season_team_id,course_slot" }).select("id,fixture_id,season_team_id,course_slot,course_name,player_one_id,player_two_id,player_one_holes,player_two_holes,home_holes_won,away_holes_won,status,submitted_by,submitted_at,updated_by,updated_at").single()
  if (saved.error) return error(saved.error.message, 503)
  await client.from("doubles_result_audit").insert({ fixture_id: body.fixture_id, action: isFullSubmission ? "SUBMITTED" : "DRAFT_SAVED", actor_player_id: payload.participantId, course_slot: body.course_slot, after_payload: saved.data })
  return NextResponse.json({ draft: saved.data, message: isFullSubmission ? "Team submission received." : "Draft saved." })
}
