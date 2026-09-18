export type PlayerScorecardHistoryHole = {
  hole_number: number
  par: number
  strokes: number
  score_to_par: number
}

export type PlayerScorecardHistoryEntry = {
  league: string
  season_number: number | null
  competition: string | null
  division: string | null
  game_number: number | null
  round: string | null
  course_code: string
  course: string
  difficulty: "Easy" | "Hard"
  played_date: string
  submitted_at: string | null
  verified_at: string
  total_strokes: number
  score_to_par: number
  result: Record<string, unknown>
  holes: PlayerScorecardHistoryHole[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function parsePlayerScorecardHistory(value: unknown): PlayerScorecardHistoryEntry[] {
  if (!Array.isArray(value)) throw new Error("Scorecard history is unavailable.")
  return value.map((entry) => {
    if (!isObject(entry) || typeof entry.league !== "string" || typeof entry.course !== "string" || !Array.isArray(entry.holes)) {
      throw new Error("Scorecard history is unavailable.")
    }
    if (entry.holes.length !== 18 || entry.holes.some((hole) => !isObject(hole) || !Number.isInteger(hole.hole_number) || !Number.isInteger(hole.par) || !Number.isInteger(hole.strokes))) {
      throw new Error("Scorecard history is incomplete.")
    }
    return entry as PlayerScorecardHistoryEntry
  })
}

export function scorecardHistoryPath(entry: PlayerScorecardHistoryEntry) {
  return [
    entry.league,
    entry.season_number === null ? entry.competition : `Season ${entry.season_number}`,
    entry.game_number === null ? entry.round : `Game ${entry.game_number}`,
    `${entry.course} ${entry.difficulty}`,
  ].filter(Boolean).join(" → ")
}
