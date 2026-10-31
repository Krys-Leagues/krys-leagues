export type PublicCurrentMatchStanding = {
  season_number: number; division_number: number; rank: number | null; starting_rank: number; player_screen_name: string
  played: number; wins: number; losses: number; draws: number; points: number; holes_won: number
}
export type PublicCurrentMatchup = {
  season_number: number; division_number: number; game_number: number
  player1_display_name: string | null; player2_display_name: string | null; course: string | null
}
export type PublicHistoricalMatchSeason = {
  season_number: number; historical_label: string; historical_year: number | null
  evidence_level: "standings_only" | "aggregate_course" | "fixture_detailed"
}
export type PublicHistoricalMatchStanding = {
  season_number: number; division_number: number; source_final_rank: number; historical_display_name: string
  played: number; wins: number; losses: number; draws: number; points: number; holes_won: number
}
export type PublicHistoricalMatchup = {
  season_number: number; division_number: number; game_number: number
  player1_historical_display_name: string; player2_historical_display_name: string
  historical_course_name: string
}
export type PublicMatchPayload = {
  current: { season_number: number | null; division_count: number | null; standings: PublicCurrentMatchStanding[]; schedule: PublicCurrentMatchup[] }
  historical_seasons: PublicHistoricalMatchSeason[]
  historical_standings: PublicHistoricalMatchStanding[]
  historical_matchups: PublicHistoricalMatchup[]
}

export function publicMatchDivisions(rows: Array<{ division_number: number }>) {
  return [...new Set(rows.map((row) => row.division_number))].sort((left, right) => left - right)
}

export function publicMatchDisplayRank(rank: number | null, startingRank: number) {
  return rank ?? startingRank
}
