export type CourseChallengeDiscordGameStatus =
  | "open"
  | "started"
  | "completed"
  | "cancelled"
  | "voided"

export type CourseChallengeDiscordGameRow = {
  game_id: string
  book_key: "tourist-trap" | "cherry-blossom"
  original_creator_discord_user_id: string
  current_owner_discord_user_id: string
  max_players: number
  status: CourseChallengeDiscordGameStatus
  created_at: string
  lobby_deadline: string
  started_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  voided_at: string | null
  end_reason: string | null
  room_name: string | null
  discord_channel_id: string | null
  discord_thread_id: string | null
  discord_lobby_message_id: string | null
  revision: number
  last_synced_at: string
}

export type CourseChallengeDiscordParticipantRow = {
  game_id: string
  discord_user_id: string
  display_name: string
  first_joined_at: string
  latest_joined_at: string
  left_at: string | null
  original_creator: boolean
  owner_at_start: boolean
  present_at_start: boolean
  played: boolean
  left_before_start: boolean
  left_after_start: boolean
  confirmed_scorecard: boolean
  confirmed_at: string | null
}

export type CourseChallengeGameSummary = {
  totalGames: number
  startedGames: number
  completedGames: number
  cancelledGames: number
  voidedGames: number
  activeGames: number
  totalPlayerParticipations: number
  averagePlayersPerStartedGame: number
  touristTrapGames: number
  cherryBlossomGames: number
}

export function buildCourseChallengeGameSummary(
  games: CourseChallengeDiscordGameRow[],
  participants: CourseChallengeDiscordParticipantRow[],
): CourseChallengeGameSummary {
  const startedIds = new Set(
    games.filter((game) => game.started_at !== null).map((game) => game.game_id),
  )
  const startedParticipations = participants.filter(
    (participant) => startedIds.has(participant.game_id) && participant.present_at_start,
  ).length
  return {
    totalGames: games.length,
    startedGames: startedIds.size,
    completedGames: games.filter((game) => game.status === "completed").length,
    cancelledGames: games.filter((game) => game.status === "cancelled").length,
    voidedGames: games.filter((game) => game.status === "voided").length,
    activeGames: games.filter(
      (game) => game.status === "open" || game.status === "started",
    ).length,
    totalPlayerParticipations: participants.length,
    averagePlayersPerStartedGame:
      startedIds.size === 0 ? 0 : startedParticipations / startedIds.size,
    touristTrapGames: games.filter((game) => game.book_key === "tourist-trap").length,
    cherryBlossomGames: games.filter((game) => game.book_key === "cherry-blossom").length,
  }
}

export function courseChallengeBookName(bookKey: string) {
  if (bookKey === "tourist-trap") return "Tourist Trap"
  if (bookKey === "cherry-blossom") return "Cherry Blossom"
  return bookKey
}
