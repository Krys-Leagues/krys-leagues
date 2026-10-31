export type KwtPairRun = {
  playerId: string
  baseMap: string
  eventKey: string
  seasonNumber: number
  weekNumber: number
  courseCode: string
  roundId: string | null
  score: number | null
  completed: boolean
}

export type StrictKwtCombinedPair = {
  playerId: string
  baseMap: string
  eventKey: string
  seasonNumber: number
  weekNumber: number
  easyCourseCode: string
  hardCourseCode: string
  easyRoundId: string
  hardRoundId: string
  easyScore: number
  hardScore: number
  combinedScore: number
  pairingEvidenceType: "same_scorecard_consecutive_source_rounds"
}

export function buildStrictKwtCombinedPair(easy: KwtPairRun, hard: KwtPairRun): StrictKwtCombinedPair | null {
  if (easy.playerId !== hard.playerId || easy.baseMap !== hard.baseMap || easy.eventKey !== hard.eventKey) return null
  if (easy.seasonNumber !== hard.seasonNumber || easy.weekNumber !== hard.weekNumber) return null
  if (!easy.completed || !hard.completed || easy.score === null || hard.score === null) return null
  if (!easy.roundId || !hard.roundId || !/^\d+$/.test(easy.roundId) || !/^\d+$/.test(hard.roundId)) return null
  if (BigInt(hard.roundId) !== BigInt(easy.roundId) + BigInt(1)) return null
  return { playerId: easy.playerId, baseMap: easy.baseMap, eventKey: easy.eventKey, seasonNumber: easy.seasonNumber, weekNumber: easy.weekNumber, easyCourseCode: easy.courseCode, hardCourseCode: hard.courseCode, easyRoundId: easy.roundId, hardRoundId: hard.roundId, easyScore: easy.score, hardScore: hard.score, combinedScore: easy.score + hard.score, pairingEvidenceType: "same_scorecard_consecutive_source_rounds" }
}

export function isStrictKwtCombinedRow(row: { difficulty: string; player_id: string; base_map?: string | null; event_key?: string | null; season_number?: number | null; week_number?: number | null; easy_round_id?: string | null; hard_round_id?: string | null; pairing_evidence_type?: string | null }) {
  return row.difficulty !== "Combined" || Boolean(row.player_id && row.base_map && row.event_key && row.season_number != null && row.week_number != null && row.easy_round_id && row.hard_round_id && row.pairing_evidence_type === "same_scorecard_consecutive_source_rounds" && /^\d+$/.test(row.easy_round_id) && /^\d+$/.test(row.hard_round_id) && BigInt(row.hard_round_id) === BigInt(row.easy_round_id) + BigInt(1))
}
