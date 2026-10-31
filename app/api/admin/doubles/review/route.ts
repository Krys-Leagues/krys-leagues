import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createDoublesRuntimeClient } from "@/lib/doublesParticipantServer"

function fail(message: string, status = 400) { return NextResponse.json({ error: message }, { status }) }

function integerInRange(value: unknown, min: number, max: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null
}

function validHoleRow(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 18 && value.every((hole) => hole === 0 || hole === 1)
}

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const fixtureId = new URL(request.url).searchParams.get("fixture_id")
  const client = createDoublesRuntimeClient()
  const drafts = await client.from("doubles_team_course_drafts").select("*").match(fixtureId ? { fixture_id: fixtureId } : {}).order("updated_at", { ascending: false })
  const evidence = await client.from("doubles_course_evidence").select("id,fixture_id,course_slot,original_filename,content_type,status,uploaded_by,uploaded_at,reviewed_by,reviewed_at").match(fixtureId ? { fixture_id: fixtureId } : {}).order("uploaded_at", { ascending: false })
  if (drafts.error || evidence.error) return fail("Doubles review queue is unavailable", 503)
  return NextResponse.json({ drafts: drafts.data || [], evidence: evidence.data || [] })
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  let body: { action?: string; fixture_id?: string; course_slot?: string; draft_id?: string; status?: string; player_one_holes?: unknown; player_two_holes?: unknown; home_holes_won?: unknown; away_holes_won?: unknown; home_course_home_holes?: unknown; home_course_away_holes?: unknown; away_course_home_holes?: unknown; away_course_away_holes?: unknown; home_holes_won_overall?: unknown; away_holes_won_overall?: unknown; reason?: string }
  try { body = await request.json() } catch { return fail("Invalid review request") }
  if (!body.action || !body.fixture_id) return fail("Review action and fixture are required")
  const client = createDoublesRuntimeClient()
  if (body.action === "mark_needs_correction") {
    const updated = await client.from("doubles_team_course_drafts").update({ status: "NEEDS_CORRECTION", updated_at: new Date().toISOString() }).eq("fixture_id", body.fixture_id).neq("status", "VERIFIED").select("id")
    if (updated.error) return fail(updated.error.message, 503)
    await client.from("doubles_course_evidence").update({ status: "NEEDS_CORRECTION", reviewed_by: (await authorization.supabase.auth.getUser()).data.user?.id || null, reviewed_at: new Date().toISOString() }).eq("fixture_id", body.fixture_id).neq("status", "VERIFIED")
    return NextResponse.json({ corrected: true })
  }
  if (body.action === "edit_draft" && body.draft_id) {
    const draft = await client.from("doubles_team_course_drafts").select("*").eq("id", body.draft_id).eq("fixture_id", body.fixture_id).single()
    if (draft.error || !draft.data) return fail("Draft not found", 404)
    const homeHolesWon = integerInRange(body.home_holes_won, 0, 18)
    const awayHolesWon = integerInRange(body.away_holes_won, 0, 18)
    if (!validHoleRow(body.player_one_holes) || !validHoleRow(body.player_two_holes) || homeHolesWon === null || awayHolesWon === null) return fail("Admin edits require two complete 18-hole 0/1 rows and valid course totals")
    const update = await client.from("doubles_team_course_drafts").update({ player_one_holes: body.player_one_holes, player_two_holes: body.player_two_holes, home_holes_won: homeHolesWon, away_holes_won: awayHolesWon, status: "SUBMITTED", updated_at: new Date().toISOString() }).eq("id", body.draft_id).select("*").single()
    if (update.error) return fail(update.error.message, 503)
    await client.from("doubles_result_audit").insert({ fixture_id: body.fixture_id, action: "HOLE_EDITED", actor_user_id: (await authorization.supabase.auth.getUser()).data.user?.id || null, course_slot: draft.data.course_slot, before_payload: draft.data, after_payload: update.data })
    return NextResponse.json({ draft: update.data })
  }
  if (body.action === "verify_evidence" && body.course_slot) {
    const updated = await client.from("doubles_course_evidence").update({ status: "VERIFIED", reviewed_by: (await authorization.supabase.auth.getUser()).data.user?.id || null, reviewed_at: new Date().toISOString() }).eq("fixture_id", body.fixture_id).eq("course_slot", body.course_slot).in("status", ["SUBMITTED", "NEEDS_CORRECTION"]).select("id,status").maybeSingle()
    if (updated.error || !updated.data) return fail("Evidence was not found or is already final", 409)
    return NextResponse.json({ evidence: updated.data })
  }
  if (body.action === "verify_result" || body.action === "override_result") {
    const courseInts = [body.home_course_home_holes, body.home_course_away_holes, body.away_course_home_holes, body.away_course_away_holes].map((value) => integerInRange(value, 0, 18))
    const overallInts = [body.home_holes_won_overall, body.away_holes_won_overall].map((value) => integerInRange(value, 0, 36))
    const isOverride = body.action === "override_result"
    if ((!isOverride && courseInts.some((value) => value === null)) || overallInts.some((value) => value === null)) return fail("All authoritative holes-won values are required")
    if (isOverride && !body.reason?.trim()) return fail("An explicit reason is required for an override")
    const ints = [...courseInts, ...overallInts]
    const fixture = await client.from("doubles_managed_fixtures").select("home_season_team_id,away_season_team_id,season_id,division").eq("id", body.fixture_id).single()
    if (fixture.error || !fixture.data) return fail("Fixture not found", 404)
    if (!isOverride) {
      if (ints[4] !== ints[0]! + ints[2]! || ints[5] !== ints[1]! + ints[3]!) return fail("Overall totals must equal the two course totals")
      const [drafts, evidence] = await Promise.all([
        client.from("doubles_team_course_drafts").select("season_team_id,course_slot,home_holes_won,away_holes_won,status,player_one_holes,player_two_holes").eq("fixture_id", body.fixture_id),
        client.from("doubles_course_evidence").select("course_slot,status").eq("fixture_id", body.fixture_id),
      ])
      if (drafts.error || evidence.error) return fail("Doubles review data is unavailable", 503)
      if ((drafts.data || []).length !== 4 || (drafts.data || []).some((draft) => draft.status !== "SUBMITTED" || !validHoleRow(draft.player_one_holes) || !validHoleRow(draft.player_two_holes))) return fail("Both teams must submit both complete course slots before verification", 409)
      if ((evidence.data || []).length !== 2 || (evidence.data || []).some((item) => !["SUBMITTED", "VERIFIED"].includes(item.status))) return fail("Both private course evidence uploads are required before verification", 409)
      const homeDrafts = (drafts.data || []).filter((draft) => draft.season_team_id === fixture.data.home_season_team_id)
      const awayDrafts = (drafts.data || []).filter((draft) => draft.season_team_id === fixture.data.away_season_team_id)
      const bySlot = (rows: typeof homeDrafts, slot: string) => rows.find((row) => row.course_slot === slot)
      const homeCourse = bySlot(homeDrafts, "HOME_TEAM_COURSE")
      const awayCourse = bySlot(awayDrafts, "HOME_TEAM_COURSE")
      const homeAwayCourse = bySlot(homeDrafts, "AWAY_TEAM_COURSE")
      const awayAwayCourse = bySlot(awayDrafts, "AWAY_TEAM_COURSE")
      if (!homeCourse || !awayCourse || !homeAwayCourse || !awayAwayCourse) return fail("Both teams must submit each named course slot", 409)
      if (homeCourse.home_holes_won !== ints[0] || homeCourse.away_holes_won !== ints[1] || awayCourse.home_holes_won !== ints[0] || awayCourse.away_holes_won !== ints[1] || homeAwayCourse.home_holes_won !== ints[2] || homeAwayCourse.away_holes_won !== ints[3] || awayAwayCourse.home_holes_won !== ints[2] || awayAwayCourse.away_holes_won !== ints[3]) return fail("Submitted team totals disagree; use correction or an explicit override", 409)
    }
    const saved = await authorization.supabase.rpc("save_doubles_result", { p_fixture_id: body.fixture_id, p_home_course_home_holes: ints[0], p_home_course_away_holes: ints[1], p_away_course_home_holes: ints[2], p_away_course_away_holes: ints[3], p_home_holes_won: ints[4], p_away_holes_won: ints[5], p_override_reason: isOverride ? body.reason?.trim() : null })
    if (saved.error) return fail(saved.error.message, 400)
    const rebuilt = await authorization.supabase.rpc("rebuild_doubles_standings", { p_season_id: fixture.data.season_id, p_division: fixture.data.division })
    if (rebuilt.error) return fail(rebuilt.error.message, 503)
    await client.from("doubles_team_course_drafts").update({ status: "VERIFIED" }).eq("fixture_id", body.fixture_id).eq("status", "SUBMITTED")
    await client.from("doubles_course_evidence").update({ status: "VERIFIED", reviewed_by: (await authorization.supabase.auth.getUser()).data.user?.id || null, reviewed_at: new Date().toISOString() }).eq("fixture_id", body.fixture_id).neq("status", "VERIFIED")
    return NextResponse.json({ result_id: saved.data, standings_saved: rebuilt.data })
  }
  return fail("Unsupported review action")
}
