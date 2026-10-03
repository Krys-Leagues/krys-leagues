import { validateScorecardHoles } from "../core.ts"
import type { ScorecardAdapterCommitPlan, ScorecardAdapterContext, ScorecardComponentContext, ScorecardLeagueAdapter, VerifiedParticipantCard } from "./contracts"

function componentCards(context: ScorecardAdapterContext, cards: VerifiedParticipantCard[], component: ScorecardComponentContext) {
  const selected = cards.filter((card) => card.componentKey === component.key)
  if (selected.length !== 2 || new Set(selected.map((card) => card.participant.roleKey)).size !== 2) throw new Error(`PYP ${component.key} requires exactly one complete Home card and one complete Away card.`)
  const home = selected.find((card) => card.participant.roleKey === "home")
  const away = selected.find((card) => card.participant.roleKey === "away")
  if (!home || !away || home.participant.playerId !== context.participants.find((item) => item.roleKey === "home")?.playerId || away.participant.playerId !== context.participants.find((item) => item.roleKey === "away")?.playerId) throw new Error(`PYP ${component.key} cards must preserve fixture Home/Away roles.`)
  const homeHoles = validateScorecardHoles(home.holes, component.pars)
  const awayHoles = validateScorecardHoles(away.holes, component.pars)
  let homeHw = 0; let awayHw = 0
  homeHoles.forEach((hole, index) => { const opponent = awayHoles[index]; if (hole.strokes < opponent.strokes) homeHw += 1; if (opponent.strokes < hole.strokes) awayHw += 1 })
  return { homeHw, awayHw }
}

export const pypScorecardAdapter: ScorecardLeagueAdapter = {
  key: "pyp", implementation: "commit_ready", ownership: "player",
  cardStructure: "Two distinct course components; each has one complete Home card and one complete Away card.",
  validateForVerification(cards) {
    if (cards.length !== 4 || new Set(cards.map((card) => `${card.componentKey}:${card.participant.roleKey}`)).size !== 4) throw new Error("PYP verification requires exactly one Home and one Away card for each course component.")
  },
  buildCommitPlan(context, cards): ScorecardAdapterCommitPlan {
    if (context.sourceType !== "fixture" || !context.sourceKey || !context.seasonId || context.divisionNumber === null || !context.pypComponents?.course1 || !context.pypComponents.course2) throw new Error("PYP verification requires an authoritative managed fixture and both courses.")
    const home = context.participants.find((item) => item.roleKey === "home")
    const away = context.participants.find((item) => item.roleKey === "away")
    if (!home?.playerId || !away?.playerId || home.playerId === away.playerId) throw new Error("PYP verification requires distinct canonical Home and Away players.")
    const course1 = componentCards(context, cards, context.pypComponents.course1)
    const course2 = componentCards(context, cards, context.pypComponents.course2)
    return { adapterKey: "pyp", sourceKey: context.sourceKey, resultPayload: {
      rpc: "save_pyp_result", p_schedule_id: context.sourceKey,
      p_course1_name: context.pypComponents.course1.courseName, p_course1_difficulty: context.pypComponents.course1.difficulty, p_course1_home_hw: course1.homeHw, p_course1_away_hw: course1.awayHw,
      p_course2_name: context.pypComponents.course2.courseName, p_course2_difficulty: context.pypComponents.course2.difficulty, p_course2_home_hw: course2.homeHw, p_course2_away_hw: course2.awayHw,
    }, standingsRefresh: { rpc: "rebuild_pyp_standings", p_season_id: context.seasonId, p_division_number: context.divisionNumber } }
  },
}
