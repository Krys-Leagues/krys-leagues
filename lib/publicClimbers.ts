export type PublicClimbersStanding = {
  player_id: string
  screen_name: string
  points: number
  event_count: number
}

export type PublicClimbersSeason = {
  id: string
  label: string
  starts_at: string
  ends_at: string
  status: string
  standings: PublicClimbersStanding[]
  winner_names: string[]
}

export type PublicClimbersPayload = {
  current_season_id: string | null
  seasons: PublicClimbersSeason[]
  error?: string
}

export const EMPTY_PUBLIC_CLIMBERS_PAYLOAD: PublicClimbersPayload = {
  current_season_id: null,
  seasons: [],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function normalizePublicClimbersPayload(value: unknown): PublicClimbersPayload {
  if (!isRecord(value)) return { ...EMPTY_PUBLIC_CLIMBERS_PAYLOAD, error: "Public Climbers data could not be read." }

  const seasons = Array.isArray(value.seasons)
    ? value.seasons.flatMap((candidate) => {
      if (!isRecord(candidate) || typeof candidate.id !== "string") return []
      const standings = Array.isArray(candidate.standings)
        ? candidate.standings.flatMap((standing) => {
          if (!isRecord(standing) || typeof standing.player_id !== "string" || typeof standing.screen_name !== "string") return []
          return [{
            player_id: standing.player_id,
            screen_name: standing.screen_name,
            points: typeof standing.points === "number" ? standing.points : 0,
            event_count: typeof standing.event_count === "number" ? standing.event_count : 0,
          }]
        })
        : []
      return [{
        id: candidate.id,
        label: typeof candidate.label === "string" ? candidate.label : "Climbers Season",
        starts_at: typeof candidate.starts_at === "string" ? candidate.starts_at : "",
        ends_at: typeof candidate.ends_at === "string" ? candidate.ends_at : "",
        status: typeof candidate.status === "string" ? candidate.status : "unknown",
        standings,
        winner_names: Array.isArray(candidate.winner_names) ? candidate.winner_names.filter((name): name is string => typeof name === "string") : [],
      }]
    })
    : []

  return {
    current_season_id: typeof value.current_season_id === "string" ? value.current_season_id : null,
    seasons,
    ...(typeof value.error === "string" ? { error: value.error } : {}),
  }
}
