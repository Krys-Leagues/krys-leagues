import type { SupabaseClient } from "@supabase/supabase-js"
import { nextArrangeState } from "./doublesSystems.ts"

export async function applyDoublesArrangeMutation(input: {
  client: SupabaseClient
  fixtureId: string
  participantId: string
  participantIds: string[]
  action: "propose" | "counter" | "accept"
  proposedFor: string
}) {
  if (!input.participantIds.includes(input.participantId) || input.participantIds.length !== 4 || new Set(input.participantIds).size !== 4) throw new Error("Only the four scheduled Doubles players may arrange this fixture")
  if (Number.isNaN(Date.parse(input.proposedFor))) throw new Error("A valid proposed game time is required")
  const duplicate = await input.client.from("doubles_arrangement_proposals").select("*,doubles_arrangements(*)").eq("fixture_id", input.fixtureId).eq("proposed_by", input.participantId).eq("proposed_for", input.proposedFor).in("state", ["PROPOSED", "COUNTERED", "ACCEPTED"]).maybeSingle()
  if (duplicate.error) throw new Error(duplicate.error.message)
  if (duplicate.data) return { arrangement: Array.isArray(duplicate.data.doubles_arrangements) ? duplicate.data.doubles_arrangements[0] : duplicate.data.doubles_arrangements, proposal: duplicate.data, matchSet: duplicate.data.state === "ACCEPTED", idempotent: true }
  const current = await input.client.from("doubles_arrangements").select("state").eq("fixture_id", input.fixtureId).maybeSingle()
  if (current.error) throw new Error(current.error.message)
  const state = (current.data?.state ?? "NOT ARRANGED") as "NOT ARRANGED" | "PROPOSED" | "COUNTERED" | "ACCEPTED"
  const nextState = nextArrangeState(state, input.action)
  if (!nextState) throw new Error("Arrange action is not valid for the current state")
  const obsolete = await input.client.from("doubles_arrangement_proposals").update({ state: "OBSOLETE" }).eq("fixture_id", input.fixtureId).in("state", ["PROPOSED", "COUNTERED"])
  if (obsolete.error) throw new Error(obsolete.error.message)
  const proposal = await input.client.from("doubles_arrangement_proposals").insert({ fixture_id: input.fixtureId, proposed_for: input.proposedFor, proposed_by: input.participantId, state: nextState }).select("*").single()
  if (proposal.error) throw new Error(proposal.error.message)
  const arrangement = await input.client.from("doubles_arrangements").upsert({ fixture_id: input.fixtureId, state: nextState, proposed_at: new Date().toISOString(), accepted_at: nextState === "ACCEPTED" ? new Date().toISOString() : null, accepted_for: nextState === "ACCEPTED" ? input.proposedFor : null, last_actor_player_id: input.participantId }).select("*").single()
  if (arrangement.error) throw new Error(arrangement.error.message)
  if (nextState === "ACCEPTED") {
    const eligibleAt = new Date(Date.parse(input.proposedFor) - 20 * 60 * 1000).toISOString()
    const reminders = await input.client.from("doubles_arrangement_reminders").upsert(input.participantIds.map((recipientPlayerId) => ({ fixture_id: input.fixtureId, recipient_player_id: recipientPlayerId, reminder_key: input.proposedFor, eligible_at: eligibleAt })), { onConflict: "fixture_id,recipient_player_id,reminder_key", ignoreDuplicates: true })
    if (reminders.error) throw new Error(reminders.error.message)
  }
  return { arrangement: arrangement.data, proposal: proposal.data, matchSet: nextState === "ACCEPTED" }
}
