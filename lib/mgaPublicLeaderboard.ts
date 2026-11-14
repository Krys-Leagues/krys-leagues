export type PublicMGAStanding = {
  position: number | null
  screen_name: string
  r1: number | null
  r2: number | null
  r3: number | null
  r4: number | null
  combined: number | null
}

const integerOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function normalizePublicMGAStandings(data: unknown): PublicMGAStanding[] {
  if (!Array.isArray(data)) return []

  return data.flatMap((value) => {
    if (!value || typeof value !== "object") return []
    const row = value as Record<string, unknown>
    if (typeof row.screen_name !== "string" || row.screen_name.length === 0) return []

    return [{
      position: integerOrNull(row.position),
      screen_name: row.screen_name,
      r1: integerOrNull(row.r1),
      r2: integerOrNull(row.r2),
      r3: integerOrNull(row.r3),
      r4: integerOrNull(row.r4),
      combined: integerOrNull(row.combined),
    }]
  })
}

export function formatPublicMGAScore(score: number | null): string {
  if (score === null) return "—"
  if (score === 0) return "E"
  return score > 0 ? `+${score}` : String(score)
}
