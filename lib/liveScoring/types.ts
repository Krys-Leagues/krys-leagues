export type RoundConfig = {
  id: string
  number: number
  label: string
  date: string
  course: string
  difficulty: "easy" | "hard"
  par: number
}

export type TournamentScoringConfig = {
  id: string
  name: string
  subtitle: string
  artwork: string
  theme: { background: string; surface: string; accent: string; text: string; muted: string }
  scoring: { method: "sum-relative-to-par"; missingRound: "omit"; tieRule: "competition" }
  defaultRoomCapacity: number
  rounds: RoundConfig[]
}

export type ScoreStatus = "submitted" | "verified"
export type RoundScore = { playerId: string; roundId: string; strokes: number; status: ScoreStatus; updatedAt: string }
export type StudioPlayer = { id: string; screenName: string; registrationId: string; timeZone?: string }

export type LeaderboardRow = {
  player: StudioPlayer
  rounds: Array<{ round: RoundConfig; score: RoundScore | null; toPar: number | null }>
  combined: number | null
  playedRounds: number
  verifiedRounds: number
  status: "Not started" | "Provisional" | "Official"
  rank: number | null
}

export type RoomAssignment = {
  eventId: string
  roomId: string
  playerId: string
  roundId: string
  screenName: string
  roomName: string
  course: string
  difficulty: "easy" | "hard"
  startsAt: string
  timeZone: string
  roomRoster: string[]
  publishedVersion: number
  published: boolean
  roomSource?: "studio" | "mga_regular"
}

export type RoomRecord = {
  id: string
  eventId: string
  roundId: string
  roomName: string
  course: string
  difficulty: "easy" | "hard"
  startsAt: string
  timeZone: string
  playerIds: string[]
  capacity: number
  publishedVersion: number
  published: boolean
}
