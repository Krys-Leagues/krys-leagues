import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { pypScorecardAdapter } from "./adapters/pyp"
import { strokeScorecardAdapter } from "./adapters/stroke"
import type { ScorecardAdapterContext, VerifiedParticipantCard } from "./adapters/contracts"
import { calculateScorecardTotals, resolvePlayedDate, type ScorecardHoleInput } from "./core"
import { enqueueStrokeBoardSync } from "./strokeBoardServer"

type ContextRow = {
  id: string
  adapter_key: string
  source_type: ScorecardAdapterContext["sourceType"]
  source_key: string
  season_id: string | null
  season_number: number | null
  division_number: number | null
  division_label: string | null
  game_number: number | null
  round_key: string | null
  round_label: string | null
  arranged_played_date: string | null
  event_played_date: string | null
  course_id: string
  course_code: string
  course_name_snapshot: string
  difficulty: "Easy" | "Hard"
  par_snapshot: number[]
  context_metadata?: Record<string, unknown>
}

type ComponentRow = { component_key: string; course_id: string; course_code: string; course_name_snapshot: string; difficulty: "Easy" | "Hard"; par_snapshot: number[] }

type ParticipantRow = {
  id: string
  role_key: string
  player_id: string | null
  team_id: string | null
  display_name_snapshot: string
}

export type AdminScorecardInput = {
  participantId: string
  componentKey?: string
  evidenceId?: string
  holes: ScorecardHoleInput[]
}

function adapterContext(context: ContextRow, participants: ParticipantRow[], components: ComponentRow[] = []): ScorecardAdapterContext {
  const componentMap = new Map(components.map((component) => [component.component_key, component]))
  const course1 = componentMap.get("course1")
  const course2 = componentMap.get("course2")
  return {
    adapterKey: context.adapter_key as ScorecardAdapterContext["adapterKey"],
    sourceType: context.source_type,
    sourceKey: context.source_key,
    seasonId: context.season_id,
    seasonNumber: context.season_number,
    divisionNumber: context.division_number,
    divisionLabel: context.division_label,
    gameNumber: context.game_number,
    roundKey: context.round_key,
    roundLabel: context.round_label,
    arrangedPlayedDate: context.arranged_played_date,
    eventPlayedDate: context.event_played_date,
    courseId: context.course_id,
    courseCode: context.course_code,
    courseName: context.course_name_snapshot,
    difficulty: context.difficulty,
    pars: context.par_snapshot,
    participants: participants.map((participant) => ({
      roleKey: participant.role_key,
      playerId: participant.player_id,
      teamId: participant.team_id,
      displayName: participant.display_name_snapshot,
    })),
    ...(course1 || course2 ? { pypComponents: {
      ...(course1 ? { course1: { key: "course1" as const, courseId: course1.course_id, courseCode: course1.course_code, courseName: course1.course_name_snapshot, difficulty: course1.difficulty, pars: course1.par_snapshot } } : {}),
      ...(course2 ? { course2: { key: "course2" as const, courseId: course2.course_id, courseCode: course2.course_code, courseName: course2.course_name_snapshot, difficulty: course2.difficulty, pars: course2.par_snapshot } } : {}),
    } } : {}),
  }
}

export async function loadScorecardReviewContext(client: SupabaseClient, evidenceId: string) {
  const evidence = await client.from("shared_scorecard_evidence")
    .select("id,context_id,component_key,storage_bucket,storage_path,original_filename,review_status,submitted_at,submitted_by_player_id")
    .eq("id", evidenceId).maybeSingle()
  if (evidence.error || !evidence.data) throw new Error("SCORECARD_REVIEW_NOT_FOUND")
  const [context, participants, existingCards, components, evidenceItems] = await Promise.all([
    client.from("shared_scorecard_contexts").select("*").eq("id", evidence.data.context_id).single(),
    client.from("shared_scorecard_participants").select("id,role_key,player_id,team_id,display_name_snapshot").eq("context_id", evidence.data.context_id).order("role_key"),
    client.from("shared_scorecards").select("id,participant_id,component_key,played_date,played_date_source,card_date_text,review_status,total_strokes,total_par,score_to_par,shared_scorecard_holes(hole_number,par,strokes)").eq("context_id", evidence.data.context_id),
    client.from("shared_scorecard_context_components").select("component_key,course_id,course_code,course_name_snapshot,difficulty,par_snapshot").eq("context_id", evidence.data.context_id),
    client.from("shared_scorecard_evidence").select("id,component_key,storage_bucket,storage_path,original_filename,review_status,submitted_at,submitted_by_player_id").eq("context_id", evidence.data.context_id).in("review_status", ["submitted", "under_review", "verified"]),
  ])
  if (context.error || participants.error || existingCards.error || components.error || evidenceItems.error) throw new Error("SCORECARD_REVIEW_LOAD_FAILED")
  const signedItems = await Promise.all((evidenceItems.data || []).map(async (item) => ({ ...item, signedUrl: (await client.storage.from(String(item.storage_bucket)).createSignedUrl(String(item.storage_path), 900)).data?.signedUrl || "" })))
  if (signedItems.some((item) => !item.signedUrl)) throw new Error("SCORECARD_EVIDENCE_UNAVAILABLE")
  const evidenceRow = evidence.data
  return {
    evidence: { ...evidenceRow, signedUrl: signedItems.find((item) => item.id === evidenceRow.id)?.signedUrl || "" },
    evidenceItems: signedItems,
    context: context.data as ContextRow,
    participants: (participants.data || []) as ParticipantRow[],
    cards: existingCards.data || [],
    components: (components.data || []) as ComponentRow[],
  }
}

export async function saveAdminScorecardReview(options: {
  client: SupabaseClient
  evidenceId: string
  adminAuthUserId: string
  playedDate: string
  rawCardDateText?: string | null
  changeReason?: string | null
  cards: AdminScorecardInput[]
  verify: boolean
}) {
  const review = await loadScorecardReviewContext(options.client, options.evidenceId)
  const context = adapterContext(review.context, review.participants, review.components)
  if (options.cards.length !== review.participants.length) throw new Error("SCORECARD_REVIEW_CARD_COUNT_INVALID")
  const participantById = new Map(review.participants.map((participant) => [participant.id, participant]))
  const played = resolvePlayedDate({
    arrangedGameDate: context.arrangedPlayedDate,
    eventRoundDate: context.eventPlayedDate,
    adminSelectedDate: options.playedDate,
    rawCardDateText: options.rawCardDateText,
  })
  const prepared = options.cards.map((input) => {
    const participant = participantById.get(input.participantId)
    if (!participant) throw new Error("SCORECARD_REVIEW_PARTICIPANT_INVALID")
    const component = context.adapterKey === "pyp" && input.componentKey ? context.pypComponents?.[input.componentKey as "course1" | "course2"] : null
    return { input, participant, totals: calculateScorecardTotals(input.holes, component?.pars || context.pars) }
  })
  const saved: Array<{ cardId: string; card: VerifiedParticipantCard }> = []
  for (const { input, participant, totals } of prepared) {
    const result = await options.client.rpc("save_shared_scorecard_draft_service", {
      p_card_id: null,
      p_context_id: review.context.id,
      p_participant_id: participant.id,
      p_evidence_id: input.evidenceId || options.evidenceId,
      p_component_key: input.componentKey || "primary",
      p_played_date: played.playedDate,
      p_played_date_source: played.source,
      p_card_date_text: played.rawCardDateText,
      p_holes: input.holes,
      p_admin_auth_user_id: options.adminAuthUserId,
      p_change_reason: options.changeReason || null,
    })
    if (result.error || !result.data) throw new Error("SCORECARD_DRAFT_SAVE_FAILED")
    saved.push({
      cardId: String(result.data),
      card: {
        participant: {
          roleKey: participant.role_key,
          playerId: participant.player_id,
          teamId: participant.team_id,
          displayName: participant.display_name_snapshot,
        },
        componentKey: input.componentKey || "primary",
        holes: input.holes,
        totals,
      },
    })
  }
  if (!options.verify) return { verified: false, cardIds: saved.map((entry) => entry.cardId) }
  const adapter = context.adapterKey === "stroke" ? strokeScorecardAdapter : context.adapterKey === "pyp" ? pypScorecardAdapter : null
  if (!adapter) throw new Error("SCORECARD_ADAPTER_VERIFICATION_NOT_ENABLED")
  const cardsForVerification = saved.map((entry) => ({ cardId: entry.cardId, card: entry.card }))
  if (context.adapterKey === "pyp") {
    const participantById = new Map(review.participants.map((participant) => [participant.id, participant]))
    for (const existing of review.cards as Array<{ id: string; participant_id: string; component_key: string; review_status: string; shared_scorecard_holes?: Array<{ hole_number: number; par: number; strokes: number }> }>) {
      if (cardsForVerification.some((entry) => entry.cardId === existing.id) || !["under_review", "reopened", "verified_pending_commit", "verified"].includes(existing.review_status) || !existing.shared_scorecard_holes || existing.shared_scorecard_holes.length !== 18) continue
      const participant = participantById.get(existing.participant_id)
      const component = context.pypComponents?.[existing.component_key as "course1" | "course2"]
      if (!participant || !component) continue
      const holes = existing.shared_scorecard_holes.map((hole) => ({ holeNumber: hole.hole_number, par: hole.par, strokes: hole.strokes }))
      cardsForVerification.push({ cardId: existing.id, card: { componentKey: existing.component_key, participant: { roleKey: participant.role_key, playerId: participant.player_id, teamId: participant.team_id, displayName: participant.display_name_snapshot }, holes, totals: calculateScorecardTotals(holes, component.pars) } })
    }
    if (new Set(cardsForVerification.map((entry) => `${entry.card.componentKey}:${entry.card.participant.roleKey}`)).size < 4) return { verified: false, waitingForComponents: true, cardIds: saved.map((entry) => entry.cardId) }
  }
  adapter.validateForVerification(cardsForVerification.map((entry) => entry.card))
  const plan = adapter.buildCommitPlan(context, cardsForVerification.map((entry) => entry.card))
  const begin = await options.client.rpc("begin_shared_scorecard_verification_service", {
    p_context_id: review.context.id,
    p_card_ids: cardsForVerification.map((entry) => entry.cardId),
    p_admin_auth_user_id: options.adminAuthUserId,
    p_change_reason: options.changeReason || null,
  })
  if (begin.error || !begin.data) throw new Error("SCORECARD_VERIFICATION_START_FAILED")
  const commitId = String(begin.data)
  const existingCommit = await options.client.from("shared_scorecard_adapter_commits").select("commit_state").eq("id", commitId).single()
  if (existingCommit.error) throw new Error("SCORECARD_VERIFICATION_STATE_FAILED")
  if (existingCommit.data.commit_state === "succeeded") {
    if (context.adapterKey !== "stroke") return { verified: true, cardIds: cardsForVerification.map((entry) => entry.cardId), boardSync: "not_applicable" as const }
    if (context.adapterKey !== "stroke") return { verified: true, cardIds: cardsForVerification.map((entry) => entry.cardId), boardSync: "not_applicable" as const }
    let boardSync: "queued" | "retry_required" = "queued"
    try {
      await enqueueStrokeBoardSync(options.client, context.seasonId!, context.divisionNumber!, "verified_result_retry")
    } catch { boardSync = "retry_required" }
    return { verified: true, cardIds: saved.map((entry) => entry.cardId), boardSync }
  }
  try {
    const { rpc: resultRpc, ...resultArgs } = plan.resultPayload
    const result = await options.client.rpc(String(resultRpc), resultArgs)
    if (result.error) throw result.error
    if (plan.standingsRefresh) {
      const { rpc: standingsRpc, ...standingsArgs } = plan.standingsRefresh
      const standings = await options.client.rpc(String(standingsRpc), standingsArgs)
      if (standings.error) throw standings.error
    }
    const completed = await options.client.rpc("complete_shared_scorecard_verification_service", {
      p_commit_id: commitId,
      p_succeeded: true,
      p_result_payload: { adapter: plan.adapterKey, source_key: plan.sourceKey },
      p_error_message: null,
    })
    if (completed.error || completed.data !== true) throw new Error("SCORECARD_VERIFICATION_COMPLETE_FAILED")
    let boardSync: "queued" | "retry_required" = "queued"
    try {
      await enqueueStrokeBoardSync(options.client, context.seasonId!, context.divisionNumber!, "verified_result")
    } catch { boardSync = "retry_required" }
    return { verified: true, cardIds: saved.map((entry) => entry.cardId), boardSync }
  } catch {
    await options.client.rpc("complete_shared_scorecard_verification_service", {
      p_commit_id: commitId,
      p_succeeded: false,
      p_result_payload: {},
      p_error_message: "League adapter commit failed; review remains open for retry.",
    })
    throw new Error("SCORECARD_LEAGUE_COMMIT_FAILED")
  }
}
