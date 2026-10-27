import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { FIVE_FOUR_THREE_TWO_ONE_TEMPLATE, isMissingTournamentSchema, trustedTournamentClient } from "@/lib/tournaments/server"

export const dynamic = "force-dynamic"

type Body = {
  action?: unknown
  name?: unknown
  slug?: unknown
  bracketSize?: unknown
  status?: unknown
  templateId?: unknown
  rules?: unknown
  rounds?: unknown
  entrants?: unknown
  description?: unknown
  schedulePreset?: unknown
  scheduleTimezone?: unknown
  startAt?: unknown
  overallDeadlineAt?: unknown
  reason?: unknown
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : "" }

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const client = trustedTournamentClient()
  const tournamentId = new URL(request.url).searchParams.get("tournamentId")
  if (tournamentId) {
    const [tournament, registrations, rounds, matches, audit, scorecards, forfeits, confirmations] = await Promise.all([
      client.from("tournaments").select("id,name,slug,status,bracket_size,format,registration_capacity,template_id,rules,schedule_preset,schedule_timezone,start_at,overall_deadline_at,registration_open_at,registration_closed_at,created_at,started_at,completed_at").eq("id", tournamentId).maybeSingle(),
      client.from("tournament_registrations").select("id,player_id,status,seed,player_timezone,timezone_confirmed_at,registered_at,withdrawn_at").eq("tournament_id", tournamentId).order("seed"),
      client.from("tournament_rounds").select("id,round_number,name,course_config,scoring_rules,tiebreaker_rules,duration_minutes,deadline_at,schedule_timezone,is_final").eq("tournament_id", tournamentId).order("round_number"),
      client.from("tournament_matches").select("id,round_number,match_number,stable_key,player_a_id,player_b_id,winner_player_id,loser_player_id,status,scheduled_at,deadline_at,match_timezone").eq("tournament_id", tournamentId).order("round_number").order("match_number"),
      client.from("tournament_audit_log").select("id,action,details,actor_id,created_at").eq("tournament_id", tournamentId).order("created_at", { ascending: false }).limit(100),
      client.from("tournament_scorecard_submissions").select("id,match_id,player_id,evidence_path,score_payload,status,submitted_by,idempotency_key,created_at").eq("tournament_id", tournamentId).order("created_at", { ascending: false }),
      client.from("tournament_forfeit_requests").select("id,match_id,requested_by,explanation,status,decided_by,decision_reason,created_at,decided_at").in("match_id", (await client.from("tournament_matches").select("id").eq("tournament_id", tournamentId)).data?.map((row) => row.id) ?? []),
      client.from("tournament_winner_confirmations").select("id,match_id,player_id,selected_winner_id,created_at").in("match_id", (await client.from("tournament_matches").select("id").eq("tournament_id", tournamentId)).data?.map((row) => row.id) ?? []),
    ])
    const registrationPlayerIds = [...new Set((registrations.data ?? []).map((row) => row.player_id).filter(Boolean))]
    const registrationPlayers = registrationPlayerIds.length ? await client.from("players").select("id,screen_name").in("id", registrationPlayerIds) : { data: [], error: null }
    const registrationNames = new Map((registrationPlayers.data ?? []).map((row) => [row.id, row.screen_name]))
    const error = tournament.error || registrations.error || rounds.error || matches.error || audit.error || scorecards.error || forfeits.error || confirmations.error || registrationPlayers.error
    if (error) return NextResponse.json({ error: isMissingTournamentSchema(error) ? "Tournament Builder schema is not installed in this environment." : error.message }, { status: 503 })
    return NextResponse.json({ tournament: tournament.data, registrations: (registrations.data ?? []).map((row) => ({ ...row, screen_name: registrationNames.get(row.player_id) ?? null })), rounds: rounds.data ?? [], matches: matches.data ?? [], audit: audit.data ?? [], scorecards: scorecards.data ?? [], forfeits: forfeits.data ?? [], confirmations: confirmations.data ?? [] }, { headers: { "Cache-Control": "no-store" } })
  }
  const [templates, tournaments] = await Promise.all([
    client.from("tournament_templates").select("id,name,description,bracket_size,format,rules,round_defaults,artwork_path,archived_at,created_at").is("archived_at", null).order("created_at", { ascending: false }),
    client.from("tournaments").select("id,name,slug,status,bracket_size,format,registration_capacity,template_id,schedule_preset,schedule_timezone,start_at,overall_deadline_at,registration_open_at,registration_closed_at,created_at,started_at,completed_at").order("created_at", { ascending: false }),
  ])
  const error = templates.error || tournaments.error
  if (error) return NextResponse.json({ error: isMissingTournamentSchema(error) ? "Tournament Builder schema is not installed in this environment." : error.message, code: isMissingTournamentSchema(error) ? "SCHEMA_NOT_INSTALLED" : error.code }, { status: 503, headers: { "Cache-Control": "no-store" } })
  return NextResponse.json({ templates: templates.data ?? [], tournaments: tournaments.data ?? [] }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const body = await request.json().catch(() => null) as Body | null
  const action = text(body?.action)

  if (action === "create_template") {
    const name = text(body?.name) || FIVE_FOUR_THREE_TWO_ONE_TEMPLATE.name
    const description = text(body?.description) || FIVE_FOUR_THREE_TWO_ONE_TEMPLATE.description
    const size = Number(body?.bracketSize) === 64 ? 64 : 32
    const client = trustedTournamentClient()
    const { data, error } = await client.from("tournament_templates").insert({ name, description, bracket_size: size, rules: body?.rules || (size === 32 ? FIVE_FOUR_THREE_TWO_ONE_TEMPLATE.rules : {}), round_defaults: body?.rounds || [], created_by: authorization.user.id }).select("id,name,bracket_size").single()
    if (error) return NextResponse.json({ error: isMissingTournamentSchema(error) ? "Tournament Builder schema is not installed in this environment." : error.message }, { status: 503 })
    return NextResponse.json({ template: data }, { status: 201 })
  }

  if (action === "create_tournament") {
    const size = Number(body?.bracketSize)
    if (size !== 32 && size !== 64) return NextResponse.json({ error: "Choose a 32 or 64 player bracket." }, { status: 400 })
    if (!Array.isArray(body?.entrants) || ![0, size].includes(body.entrants.length)) return NextResponse.json({ error: `Use zero entrants for public self-registration, or exactly ${size} for an approved manual seed.` }, { status: 400 })
    const schedulePreset = text(body?.schedulePreset) || "NORMAL"
    const scheduleTimezone = text(body?.scheduleTimezone) || "America/New_York"
    if (!["NORMAL", "ONE_DAY", "CUSTOM"].includes(schedulePreset)) return NextResponse.json({ error: "Choose a supported schedule preset." }, { status: 400 })
    if (typeof body?.startAt !== "string" || !body.startAt || typeof body?.overallDeadlineAt !== "string" || !body.overallDeadlineAt) return NextResponse.json({ error: "Provide a start instant and overall deadline before creating the tournament." }, { status: 400 })
    const { data, error } = await authorization.supabase.rpc("admin_create_tournament", {
      p_name: text(body?.name), p_slug: text(body?.slug), p_template_id: text(body?.templateId) || null,
      p_bracket_size: size, p_status: text(body?.status) || "draft", p_rules: body?.rules || {}, p_rounds: body?.rounds || [], p_entrants: body.entrants,
      p_schedule_preset: schedulePreset, p_schedule_timezone: scheduleTimezone, p_start_at: body.startAt, p_overall_deadline_at: body.overallDeadlineAt,
    })
    if (error) {
      const needsSelfRegistrationFollowUp = body.entrants.length === 0 && /confirmed participant selection|public self-registration/i.test(error.message)
      return NextResponse.json({ error: needsSelfRegistrationFollowUp ? "Public self-registration requires the separately reviewed Tournament Builder follow-up schema; no tournament was created." : isMissingTournamentSchema(error) ? "Tournament Builder schema is not installed in this environment." : error.message }, { status: needsSelfRegistrationFollowUp || isMissingTournamentSchema(error) ? 503 : 400 })
    }
    return NextResponse.json({ tournamentId: data }, { status: 201 })
  }

  return NextResponse.json({ error: "Unsupported tournament builder action." }, { status: 400 })
}

export async function PATCH(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const body = await request.json().catch(() => null) as Body | null
  const action = text(body?.action)
  const tournamentId = text((body as { tournamentId?: unknown } | null)?.tournamentId)
  if (["set_status", "update_schedule", "extend_deadline"].includes(action)) {
    if (!tournamentId) return NextResponse.json({ error: "Tournament is required." }, { status: 400 })
    const scheduleTimezone = text(body?.scheduleTimezone) || "America/New_York"
    const { data, error } = await authorization.supabase.rpc("admin_update_tournament_control", {
      p_tournament_id: tournamentId, p_action: action, p_status: text(body?.status) || "", p_schedule_preset: text(body?.schedulePreset) || "NORMAL", p_schedule_timezone: scheduleTimezone,
      p_start_at: typeof body?.startAt === "string" && body.startAt ? body.startAt : null,
      p_overall_deadline_at: typeof body?.overallDeadlineAt === "string" && body.overallDeadlineAt ? body.overallDeadlineAt : null,
      p_reason: text(body?.reason) || null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ result: data })
  }
  const templateId = text(body?.templateId)
  if (!templateId || !["archive_template", "duplicate_template"].includes(action)) return NextResponse.json({ error: "Unsupported template action." }, { status: 400 })
  const client = trustedTournamentClient()
  const { data: template, error: readError } = await client.from("tournament_templates").select("name,description,bracket_size,rules,round_defaults,artwork_path").eq("id", templateId).maybeSingle()
  if (readError || !template) return NextResponse.json({ error: readError?.message || "Template was not found." }, { status: 404 })
  if (action === "archive_template") {
    const { error } = await client.from("tournament_templates").update({ archived_at: new Date().toISOString() }).eq("id", templateId)
    return error ? NextResponse.json({ error: error.message }, { status: 503 }) : NextResponse.json({ status: "archived" })
  }
  const { data, error } = await client.from("tournament_templates").insert({ ...template, name: `${template.name} copy`, created_by: authorization.user.id }).select("id,name,bracket_size").single()
  return error ? NextResponse.json({ error: error.message }, { status: 503 }) : NextResponse.json({ template: data }, { status: 201 })
}
