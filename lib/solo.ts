export const SOLO_DIVISIONS = [
  "Master",
  "Elite",
  "League 1",
  "League 2",
  "League 3",
  "League 4",
] as const

export type SoloDivision = (typeof SOLO_DIVISIONS)[number]

export const SOLO_DIVISION_PRESENTATION: Record<
  SoloDivision,
  { symbol: string; label: string; color: string }
> = {
  Master: { symbol: "🔥", label: "Flame", color: "#fb7185" },
  Elite: { symbol: "☄️", label: "Comet", color: "#c084fc" },
  "League 1": { symbol: "🌟", label: "Glowing star", color: "#facc15" },
  "League 2": { symbol: "⭐", label: "Star", color: "#fde047" },
  "League 3": { symbol: "✨", label: "Sparkles", color: "#67e8f9" },
  "League 4": { symbol: "💥", label: "Burst", color: "#fb923c" },
}

export function isSoloDivision(value: string): value is SoloDivision {
  return SOLO_DIVISIONS.includes(value as SoloDivision)
}
