export type SoloWeekDeadline = {
  week_number: number
  status: "open" | "closed"
  due_date: string | null
}

export function selectLiveSoloWeek<T extends SoloWeekDeadline>(weeks: readonly T[], today: string): T | undefined {
  const open = weeks.filter((week) => week.status === "open")
  return [...open].sort((a, b) => {
    const aLive = !a.due_date || a.due_date > today
    const bLive = !b.due_date || b.due_date > today
    return Number(bLive) - Number(aLive) || (aLive && bLive ? a.week_number - b.week_number : b.week_number - a.week_number)
  })[0]
}

export function soloWeekDisplayState(week: SoloWeekDeadline | undefined, today: string) {
  if (!week) return "NO_WEEK" as const
  if (week.status === "closed") return "CLOSED" as const
  return week.due_date && week.due_date <= today ? "ENDED — AWAITING FINALIZATION" as const : "LIVE" as const
}
