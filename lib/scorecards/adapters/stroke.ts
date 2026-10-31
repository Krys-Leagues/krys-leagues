import type {
  ScorecardAdapterCommitPlan,
  ScorecardAdapterContext,
  ScorecardLeagueAdapter,
  VerifiedParticipantCard,
} from "./contracts"

function requireTwoStrokePlayers(cards: VerifiedParticipantCard[]) {
  if (cards.length !== 2 || cards.some((card) => card.participant.playerId === null)) {
    throw new Error("Stroke verification requires one complete 18-hole card for each scheduled player.")
  }
  if (new Set(cards.map((card) => card.participant.playerId)).size !== 2) {
    throw new Error("Stroke verification requires two distinct canonical players.")
  }
}

export const strokeScorecardAdapter: ScorecardLeagueAdapter = {
  key: "stroke",
  implementation: "commit_ready",
  ownership: "player",
  cardStructure: "One 18-hole card per scheduled player; existing Stroke result stores each total score-to-par.",
  validateForVerification(cards) {
    requireTwoStrokePlayers(cards)
  },
  buildCommitPlan(context: ScorecardAdapterContext, cards: VerifiedParticipantCard[]): ScorecardAdapterCommitPlan {
    requireTwoStrokePlayers(cards)
    if (context.sourceType !== "fixture" || !context.seasonId || context.divisionNumber === null) {
      throw new Error("Stroke verification requires an authoritative managed fixture.")
    }
    const byRole = new Map(cards.map((card) => [card.participant.roleKey, card]))
    const player1 = byRole.get("player1")
    const player2 = byRole.get("player2")
    if (!player1 || !player2) throw new Error("Stroke cards must retain player1/player2 fixture roles.")
    return {
      adapterKey: "stroke",
      sourceKey: context.sourceKey,
      resultPayload: {
        rpc: "save_stroke_result",
        p_schedule_id: context.sourceKey,
        p_player1_score: player1.totals.scoreToPar,
        p_player2_score: player2.totals.scoreToPar,
      },
      standingsRefresh: {
        rpc: "rebuild_stroke_standings",
        p_season_id: context.seasonId,
        p_division_number: context.divisionNumber,
      },
    }
  },
}
