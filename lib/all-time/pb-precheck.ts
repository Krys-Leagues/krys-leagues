export type PbComparison = "BETTER THAN PB" | "EQUAL TO PB" | "DOES NOT BEAT PB"

export function parseOptionalRelativeScore(value: string) {
  return /^-?\d+$/.test(value.trim()) ? Number(value) : null
}

export function compareRelativeScoreToPb(score: number, currentPb: number | null): PbComparison | "FIRST SCORE" {
  if (currentPb === null) return "FIRST SCORE"
  if (score < currentPb) return "BETTER THAN PB"
  if (score === currentPb) return "EQUAL TO PB"
  return "DOES NOT BEAT PB"
}

export function formatPb(score: number | null | undefined) {
  if (score === undefined) return "PB LOOKUP PENDING"
  if (score === null) return "NO CURRENT ALL-TIME RECORD"
  return score > 0 ? `+${score}` : String(score)
}

export function formatHistoricalPb(score: number | null) {
  return score === null ? "NO ALL-TIME RECORD AT SUBMISSION" : formatPb(score)
}
