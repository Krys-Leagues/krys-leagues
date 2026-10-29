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
  Master: { symbol: "🔥", label: "Flame", color: "#F1C232" },
  Elite: { symbol: "☄️", label: "Comet", color: "#FFD966" },
  "League 1": { symbol: "🌟", label: "Glowing star", color: "#F9CB9C" },
  "League 2": { symbol: "⭐", label: "Star", color: "#EA9999" },
  "League 3": { symbol: "✨", label: "Sparkles", color: "#DD7E6B" },
  "League 4": { symbol: "💥", label: "Burst", color: "#EAD1DC" },
}

export const SOLO_LEGACY_LEAGUE_5_COLOR = "#B4A7D6"

export function soloWeekState(weeks:{week_number:number;status:"open"|"closed"}[],weekNumber:number){
  const week=weeks.find(item=>item.week_number===weekNumber)
  if(week?.status==="closed")return "closed" as const
  const current=weeks.find(item=>item.status==="open")?.week_number
  return current===weekNumber?"current" as const:"future" as const
}

export function isSoloDivision(value: string): value is SoloDivision {
  return SOLO_DIVISIONS.includes(value as SoloDivision)
}
