import { validateScorecardHoles } from "../core"
import type { ScorecardAdapterCommitPlan, ScorecardAdapterContext, ScorecardLeagueAdapter, VerifiedParticipantCard } from "./contracts"

function requireMatchCards(context: ScorecardAdapterContext, cards: VerifiedParticipantCard[]) {
  if (context.sourceType !== "fixture" || !context.seasonId || context.divisionNumber === null) throw new Error("Match verification requires an authoritative managed fixture.")
  if (cards.length !== 2 || cards.some((card) => card.participant.playerId === null) || new Set(cards.map((card) => card.participant.playerId)).size !== 2) throw new Error("Match verification requires two distinct canonical players.")
  const byRole = new Map(cards.map((card) => [card.participant.roleKey, card]))
  const player1 = byRole.get("player1")
  const player2 = byRole.get("player2")
  const fixture1 = context.participants.find((participant) => participant.roleKey === "player1")
  const fixture2 = context.participants.find((participant) => participant.roleKey === "player2")
  if (!player1 || !player2 || player1.participant.playerId !== fixture1?.playerId || player2.participant.playerId !== fixture2?.playerId) throw new Error("Match cards must retain the exact fixture players.")
  return { player1, player2 }
}

export const matchScorecardAdapter: ScorecardLeagueAdapter = {
  key: "match",
  implementation: "commit_ready",
  ownership: "player",
  cardStructure: "Two exact 18-hole player cards; per-hole comparisons feed the existing Holes Won result.",
  validateForVerification(cards) {
    if (cards.length !== 2) throw new Error("Match verification requires both player cards.")
    cards.forEach((card) => validateScorecardHoles(card.holes))
  },
  buildCommitPlan(context, cards): ScorecardAdapterCommitPlan {
    const { player1, player2 } = requireMatchCards(context, cards)
    const first = validateScorecardHoles(player1.holes, context.pars)
    const second = validateScorecardHoles(player2.holes, context.pars)
    let player1Hw = 0
    let player2Hw = 0
    first.forEach((hole, index) => {
      const opponent = second[index]
      if (hole.strokes < opponent.strokes) player1Hw += 1
      if (opponent.strokes < hole.strokes) player2Hw += 1
    })
    return {
      adapterKey: "match",
      sourceKey: context.sourceKey,
      resultPayload: { rpc: "save_match_result", p_schedule_id: context.sourceKey, p_player1_hw: player1Hw, p_player2_hw: player2Hw },
      standingsRefresh: { rpc: "rebuild_match_standings", p_season_id: context.seasonId, p_division_number: context.divisionNumber },
    }
  },
}
