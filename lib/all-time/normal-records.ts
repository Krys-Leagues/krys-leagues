export type NormalEntryType = "full_card" | "quick_score"

export type FullCardStats = {
  totalStrokes: number
  scoreRelativeToPar: number
  hn1Count: number
  birdies: number
  eagles: number
  pars: number
  bogeys: number
  otherHoles: number
}

export type RecordClassification = "FIRST" | "BETTER" | "EQUAL" | "WORSE"

export function classifyRecord(currentScore: number | null, submittedScore: number): RecordClassification {
  if (currentScore === null) return "FIRST"
  if (submittedScore < currentScore) return "BETTER"
  if (submittedScore === currentScore) return "EQUAL"
  return "WORSE"
}

export function climbersPoints(classification: RecordClassification, peoplePassed: number): number {
  return classification === "BETTER" ? Math.max(0, Math.floor(peoplePassed)) : 0
}

export function deriveFullCardStats(holeScores: number[], holePars: number[]): FullCardStats | { error: string } {
  if (holeScores.length !== 18 || holePars.length !== 18) return { error: "A full card requires exactly 18 holes and 18 authoritative pars." }
  if (holeScores.some((score) => !Number.isInteger(score) || score < 1)) return { error: "Every hole score must be a positive whole number." }
  if (holePars.some((par) => !Number.isInteger(par) || par < 1)) return { error: "Every hole must have an authoritative positive par." }

  const outcomes = holeScores.map((score, index) => score - holePars[index])
  return {
    totalStrokes: holeScores.reduce((sum, score) => sum + score, 0),
    scoreRelativeToPar: outcomes.reduce((sum, difference) => sum + difference, 0),
    hn1Count: holeScores.filter((score) => score === 1).length,
    birdies: outcomes.filter((difference) => difference === -1).length,
    eagles: outcomes.filter((difference) => difference <= -2).length,
    pars: outcomes.filter((difference) => difference === 0).length,
    bogeys: outcomes.filter((difference) => difference === 1).length,
    otherHoles: outcomes.filter((difference) => ![-2, -1, 0, 1].includes(difference)).length,
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function entryTypeLabel(entryType: string | null | undefined): string {
  if (entryType === "full_card") return "Full Card"
  if (entryType === "quick_score") return "Quick Score"
  if (entryType === "authoritative_league_source") return "Authoritative League Source"
  return "Historical Import"
}

export function observationStatus(observation: { voided_at?: string | null; corrected_at?: string | null; superseded?: boolean; tied_record?: boolean }): string {
  if (observation.voided_at) return "Voided"
  if (observation.corrected_at) return "Corrected"
  if (observation.tied_record) return "Tied record"
  if (observation.superseded) return "Superseded"
  return "Active"
}
