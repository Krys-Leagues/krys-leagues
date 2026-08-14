export type PublicCurrentMatchStanding = {
  season_number: number; division_number: number; rank: number; player_screen_name: string
  played: number; wins: number; losses: number; draws: number; points: number; holes_won: number
}
export type PublicHistoricalMatchSeason = {
  season_number: number; historical_label: string; historical_year: number | null
  evidence_level: "standings_only" | "aggregate_course"
}
export type PublicHistoricalMatchStanding = {
  season_number: number; division_number: number; source_final_rank: number; historical_display_name: string
  played: number; wins: number; losses: number; draws: number; points: number; holes_won: number
}
export type PublicHistoricalMatchCourse = {
  season_number: number; division_number: number; source_final_rank: number; course_order: number
  historical_course_name: string; played: boolean; outcome: "W" | "L" | "D" | null; holes_won: number | null
}
export type PublicMatchPayload = {
  current: { season_number: number | null; division_count: number | null; standings: PublicCurrentMatchStanding[] }
  historical_seasons: PublicHistoricalMatchSeason[]
  historical_standings: PublicHistoricalMatchStanding[]
  historical_courses: PublicHistoricalMatchCourse[]
}

export function publicMatchDivisions(rows: Array<{ division_number: number }>) {
  return [...new Set(rows.map((row) => row.division_number))].sort((left, right) => left - right)
}

export function historicalCourseLabel(course: PublicHistoricalMatchCourse) {
  return course.played ? `${course.outcome} · HW ${course.holes_won}` : "Unplayed"
}
