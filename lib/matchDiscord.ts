import {
  publicMatchDivisions,
  publicMatchDisplayRank,
  type PublicCurrentMatchStanding,
  type PublicCurrentMatchup,
  type PublicMatchPayload,
} from "./publicMatch.ts"

const MAX_CONFIGURED_MATCH_DISCORD_DIVISION = 5

export function matchDiscordControlDivisions(
  payload: PublicMatchPayload | null,
  selectedSeasonNumber: number | null,
) {
  if (
    payload?.current.season_number === null ||
    payload?.current.season_number === undefined ||
    selectedSeasonNumber !== payload.current.season_number
  ) {
    return []
  }

  const divisionCount = payload.current.division_count
  if (Number.isInteger(divisionCount) && divisionCount !== null && divisionCount > 0) {
    return Array.from(
      { length: Math.min(divisionCount, MAX_CONFIGURED_MATCH_DISCORD_DIVISION) },
      (_, index) => index + 1,
    )
  }

  return publicMatchDivisions(payload.current.standings)
    .filter((division) => division <= MAX_CONFIGURED_MATCH_DISCORD_DIVISION)
}

export type MatchDiscordStanding = Omit<PublicCurrentMatchStanding, "rank" | "starting_rank"> & {
  displayed_rank: number
}

export type MatchDiscordSnapshot = {
  season_number: number
  division_number: number
  standings: MatchDiscordStanding[]
  assignments: PublicCurrentMatchup[]
}

export function prepareMatchDiscordSnapshot(
  payload: PublicMatchPayload,
  divisionNumber: number,
): MatchDiscordSnapshot {
  const seasonNumber = payload.current.season_number
  if (seasonNumber === null) {
    throw new Error("The current Match season is not available.")
  }

  const standings = payload.current.standings
    .filter((row) => row.division_number === divisionNumber)
    .map(({ rank, starting_rank, ...row }) => ({
      ...row,
      displayed_rank: publicMatchDisplayRank(rank, starting_rank),
    }))
    .sort((left, right) =>
      left.displayed_rank - right.displayed_rank ||
      left.player_screen_name.localeCompare(right.player_screen_name),
    )

  if (standings.length === 0) {
    throw new Error("That Match division is not available in the current season.")
  }

  const assignments = payload.current.schedule
    .filter((row) => row.division_number === divisionNumber)
    .sort((left, right) => left.game_number - right.game_number)

  return {
    season_number: seasonNumber,
    division_number: divisionNumber,
    standings,
    assignments,
  }
}

const inFlightSends = new Set<string>()

export async function runMatchDiscordSendExclusive<T>(
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
