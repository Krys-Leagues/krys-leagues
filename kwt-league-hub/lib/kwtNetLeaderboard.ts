import { calculateCourseStrokeAllowance, type CourseStrokeAllowance, type VerifiedKwtEvent } from "./handicap/courseStrokeAllowance.ts"
import type { KwtDivision } from "./kwtNetCompetition.ts"

export type KwtNetBadge = "KIWI_EASY" | "KIWI_HARD" | "COCONUT"

export type KwtNetResult = {
  playerId: string
  screenName: string
  easyGross: number | null
  hardGross: number | null
  combinedGross: number | null
  easyNet: number | null
  hardNet: number | null
  combinedNet: number | null
  easyStrokes: CourseStrokeAllowance | null
  hardStrokes: CourseStrokeAllowance | null
  handicapIndex: number | null
  handicapStatus: "OFFICIAL" | "PROVISIONAL" | "UNPUBLISHED"
  resultStatus: "PENDING" | "VERIFIED" | "FINAL"
  division?: KwtDivision | "PROVISIONAL"
  points?: number | null
  badges?: readonly KwtNetBadge[]
  seasonRank?: number
  seasonPoints?: number | null
}

export type KwtNetInput = {
  playerId: string
  screenName: string
  easyGross?: number | null
  hardGross?: number | null
  handicapIndex: number | null
  handicapStatus: "OFFICIAL" | "PROVISIONAL" | "UNPUBLISHED"
  resultStatus?: "PENDING" | "VERIFIED" | "FINAL"
  division?: KwtDivision | "PROVISIONAL"
  badges?: readonly KwtNetBadge[]
}

export function netScore(gross: number, allowance: CourseStrokeAllowance): number {
  if (allowance.direction === "RECEIVED") return gross - allowance.strokes
  if (allowance.direction === "GIVEN") return gross + allowance.strokes
  return gross
}

export function buildKwtNetResults(event: VerifiedKwtEvent | null | undefined, inputs: readonly KwtNetInput[]): KwtNetResult[] {
  if (!event) return []
  return inputs.flatMap((input) => {
    const hasEasy = Number.isInteger(input.easyGross)
    const hasHard = Number.isInteger(input.hardGross)
    if (!hasEasy && !hasHard) return []
    if (input.handicapIndex === null || !Number.isFinite(input.handicapIndex)) {
      return [{
        ...input,
        easyGross: hasEasy ? input.easyGross! : null,
        hardGross: hasHard ? input.hardGross! : null,
        combinedGross: hasEasy && hasHard ? input.easyGross! + input.hardGross! : null,
        easyNet: null,
        hardNet: null,
        combinedNet: null,
        easyStrokes: null,
        hardStrokes: null,
        resultStatus: input.resultStatus ?? "PENDING",
      }]
    }
    const easyStrokes = hasEasy ? calculateCourseStrokeAllowance(input.handicapIndex, event.easySlope) : null
    const hardStrokes = hasHard ? calculateCourseStrokeAllowance(input.handicapIndex, event.hardSlope) : null
    if ((hasEasy && !easyStrokes) || (hasHard && !hardStrokes)) return []
    const easyNet = hasEasy && easyStrokes ? netScore(input.easyGross!, easyStrokes) : null
    const hardNet = hasHard && hardStrokes ? netScore(input.hardGross!, hardStrokes) : null
    return [{
      ...input,
      easyGross: hasEasy ? input.easyGross! : null,
      hardGross: hasHard ? input.hardGross! : null,
      combinedGross: input.easyGross !== null && input.easyGross !== undefined && input.hardGross !== null && input.hardGross !== undefined && hasEasy && hasHard ? input.easyGross + input.hardGross : null,
      easyNet,
      hardNet,
      combinedNet: easyNet !== null && hardNet !== null ? easyNet + hardNet : null,
      easyStrokes,
      hardStrokes,
      resultStatus: input.resultStatus ?? "PENDING",
    }]
  }).sort((left, right) => (left.combinedNet ?? Number.POSITIVE_INFINITY) - (right.combinedNet ?? Number.POSITIVE_INFINITY) || left.screenName.localeCompare(right.screenName))
}

