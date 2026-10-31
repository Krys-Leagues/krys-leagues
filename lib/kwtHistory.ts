export type KwtHistorySourceRow = {
  season_number: number
  week_number: number
  historical_player_name: string
  canonical_player_id: string
  easy_course_code: string
  easy_score: number
  hard_course_code: string
  hard_score: number
  total_score: number
  placement: number | null
}

export type PublicKwtHistoryRow = {
  seasonNumber: number
  weekNumber: number
  playerName: string
  easyCourse: string
  easyScore: number
  hardCourse: string
  hardScore: number
  totalScore: number
  placement: number | null
}

export type KwtHistoryFilters = {
  season?: number | null
  week?: number | null
  search?: string | null
}

function courseName(code: string, coursesByCode: ReadonlyMap<string, string>) {
  const normalized = code.trim().toUpperCase()
  return coursesByCode.get(normalized) || normalized
}

export function buildPublicKwtHistoryRows(
  rows: KwtHistorySourceRow[],
  playerNamesBySourceId: ReadonlyMap<string, string>,
  coursesByCode: ReadonlyMap<string, string>,
): PublicKwtHistoryRow[] {
  return rows.map((row) => ({
    seasonNumber: row.season_number,
    weekNumber: row.week_number,
    playerName: playerNamesBySourceId.get(row.canonical_player_id) || row.historical_player_name.trim(),
    easyCourse: courseName(row.easy_course_code, coursesByCode),
    easyScore: row.easy_score,
    hardCourse: courseName(row.hard_course_code, coursesByCode),
    hardScore: row.hard_score,
    totalScore: row.total_score,
    placement: row.placement,
  })).sort((left, right) =>
    right.seasonNumber - left.seasonNumber
    || right.weekNumber - left.weekNumber
    || (left.placement ?? Number.MAX_SAFE_INTEGER) - (right.placement ?? Number.MAX_SAFE_INTEGER)
    || left.totalScore - right.totalScore
    || left.playerName.localeCompare(right.playerName),
  )
}

export function filterPublicKwtHistoryRows(rows: PublicKwtHistoryRow[], filters: KwtHistoryFilters) {
  const query = filters.search?.trim().toLocaleLowerCase() || ""

  return rows.filter((row) => {
    if (filters.season && row.seasonNumber !== filters.season) return false
    if (filters.week && row.weekNumber !== filters.week) return false
    if (!query) return true
    return [row.playerName, row.easyCourse, row.hardCourse]
      .some((value) => value.toLocaleLowerCase().includes(query))
  })
}

export function formatKwtPlacement(placement: number | null) {
  if (placement === null) return "—"
  const lastTwo = placement % 100
  const suffix = lastTwo >= 11 && lastTwo <= 13
    ? "th"
    : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[placement % 10] || "th"
  return `${placement}${suffix}`
}
