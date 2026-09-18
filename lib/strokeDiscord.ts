export const MAX_CONFIGURED_STROKE_DISCORD_DIVISION = 5

export type StrokeDiscordMode = "division" | "reminder"

export type StrokeDiscordStandingSource = {
  division_number: number
  slot_number: number
  player_screen_name: string
  rank: number | null
  wins: number
  losses: number
  ties: number
  points: number
  strokes: number
}

export type StrokeDiscordAssignmentSource = {
  division_number: number
  game_number: number
  player1_display_name: string
  player2_display_name: string
  course: string | null
  player1_score: number | null
  player2_score: number | null
}

export type StrokeDiscordSource = {
  season_number: number
  division_count: number
  standings: StrokeDiscordStandingSource[]
  assignments: StrokeDiscordAssignmentSource[]
}

export type StrokeDiscordStanding = StrokeDiscordStandingSource & {
  displayed_rank: number
  played: number
}

export type StrokeDiscordAssignment = StrokeDiscordAssignmentSource & {
  completed: boolean
}

export type StrokeDiscordSnapshot = {
  season_number: number
  division_number: number
  mode: StrokeDiscordMode
  standings: StrokeDiscordStanding[]
  assignments: StrokeDiscordAssignment[]
}

export function strokeDiscordControlDivisions(
  authoritativeSeasonId: string | null,
  selectedSeasonId: string | null,
  divisionCount: number | null,
) {
  if (
    !authoritativeSeasonId
    || selectedSeasonId !== authoritativeSeasonId
    || divisionCount === null
    || !Number.isInteger(divisionCount)
    || divisionCount <= 0
  ) {
    return []
  }

  return Array.from(
    { length: Math.min(divisionCount, MAX_CONFIGURED_STROKE_DISCORD_DIVISION) },
    (_, index) => index + 1,
  )
}

export function prepareStrokeDiscordSnapshot(
  source: StrokeDiscordSource,
  divisionNumber: number,
  mode: StrokeDiscordMode,
): StrokeDiscordSnapshot {
  if (
    !Number.isInteger(divisionNumber)
    || divisionNumber <= 0
    || divisionNumber > Math.min(source.division_count, MAX_CONFIGURED_STROKE_DISCORD_DIVISION)
  ) {
    throw new Error("That Stroke division is not available in the current season.")
  }

  const standings = source.standings
    .filter((standing) => standing.division_number === divisionNumber)
    .map((standing) => ({
      ...standing,
      displayed_rank: standing.rank ?? standing.slot_number,
      played: standing.wins + standing.losses + standing.ties,
    }))
    .sort((left, right) =>
      left.displayed_rank - right.displayed_rank
      || left.player_screen_name.localeCompare(right.player_screen_name),
    )

  if (standings.length === 0) {
    throw new Error("That Stroke division has no players in the approved roster.")
  }

  const assignments = source.assignments
    .filter((assignment) => assignment.division_number === divisionNumber)
    .map((assignment): StrokeDiscordAssignment => ({
      ...assignment,
      completed: Number.isFinite(assignment.player1_score)
        && Number.isFinite(assignment.player2_score),
    }))
    .filter((assignment) => mode === "division" || !assignment.completed)
    .sort((left, right) => left.game_number - right.game_number)

  if (mode === "reminder" && assignments.length === 0) {
    throw new Error("No unplayed Stroke assignments remain in that division.")
  }

  return {
    season_number: source.season_number,
    division_number: divisionNumber,
    mode,
    standings,
    assignments,
  }
}

const inFlightSends = new Set<string>()

export async function runStrokeDiscordSendExclusive<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<{ status: "completed"; value: T } | { status: "in-flight" }> {
  if (inFlightSends.has(key)) return { status: "in-flight" }

  inFlightSends.add(key)
  try {
    return { status: "completed", value: await operation() }
  } finally {
    inFlightSends.delete(key)
  }
}
