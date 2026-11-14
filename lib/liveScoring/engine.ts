import type { LeaderboardRow, RoomAssignment, RoomRecord, RoundConfig, RoundScore, StudioPlayer, TournamentScoringConfig } from "./types"

export function calculateLeaderboard(
  config: TournamentScoringConfig,
  players: StudioPlayer[],
  scores: RoundScore[],
): LeaderboardRow[] {
  const rows = players.map((player): LeaderboardRow => {
    const rounds = config.rounds.map((round) => {
      const score = scores.find((item) => item.playerId === player.id && item.roundId === round.id) || null
      return { round, score, toPar: score ? score.strokes - round.par : null }
    })
    const playedRounds = rounds.filter((item) => item.score).length
    const verifiedRounds = rounds.filter((item) => item.score?.status === "verified").length
    const combined = rounds.reduce<number | null>((total, item) => {
      if (item.toPar === null) return total
      return (total ?? 0) + item.toPar
    }, null)
    const allRoundsVerified = config.rounds.length > 0 && verifiedRounds === config.rounds.length
    return {
      player,
      rounds,
      combined,
      playedRounds,
      verifiedRounds,
      status: playedRounds === 0 ? "Not started" : allRoundsVerified ? "Official" : "Provisional",
      rank: null,
    }
  })

  const ranked = rows.filter((row) => row.combined !== null).sort((left, right) => {
    const total = left.combined! - right.combined!
    return total || left.player.screenName.localeCompare(right.player.screenName)
  })
  let previous: number | null = null
  let rank = 0
  ranked.forEach((row, index) => {
    if (row.combined !== previous) rank = index + 1
    row.rank = rank
    previous = row.combined
  })
  return rows.sort((left, right) => {
    if (left.rank === null) return right.rank === null ? left.player.screenName.localeCompare(right.player.screenName) : 1
    if (right.rank === null) return -1
    return left.rank - right.rank || left.player.screenName.localeCompare(right.player.screenName)
  })
}

export function roundScoreToPar(score: RoundScore | null, round: RoundConfig) {
  return score ? score.strokes - round.par : null
}

export function tournamentStorageKey(tournamentId: string) {
  return `krys-live-scoring:${tournamentId}`
}

export function canPlayerSubmitRound(status: "submitted" | "verified" | null | undefined) {
  return status == null
}

export function roomNoticeKey(room: RoomAssignment) {
  return `${room.eventId}:${room.roomSource || "studio"}:${room.roomId}:${room.playerId}:${room.roundId}:v${room.publishedVersion}`
}

export function dateKeyInTimeZone(value: Date | string, timeZone = "America/New_York") {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value))
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]))
  return values.year && values.month && values.day ? `${values.year}-${values.month}-${values.day}` : ""
}

export function currentEventDate(now = new Date()) {
  return dateKeyInTimeZone(now, "America/New_York")
}

export function publishedRoomAssignments(rooms: RoomRecord[], players: StudioPlayer[]): RoomAssignment[] {
  const playersById = new Map(players.map((player) => [player.id, player]))
  return rooms.filter((room) => room.published).flatMap((room) => {
    const roomRoster = room.playerIds.map((id) => playersById.get(id)?.screenName).filter((name): name is string => Boolean(name))
    return room.playerIds.flatMap((playerId) => {
      const player = playersById.get(playerId)
      return player ? [{ eventId: room.eventId, roomId: room.id, playerId, roundId: room.roundId, screenName: player.screenName, roomName: room.roomName, course: room.course, difficulty: room.difficulty, startsAt: room.startsAt, timeZone: player.timeZone || room.timeZone, roomRoster, publishedVersion: room.publishedVersion, published: room.published }] : []
    })
  })
}

export function updateRoomRecord(rooms: RoomRecord[], roomId: string, patch: Partial<Pick<RoomRecord, "roomName" | "course" | "difficulty" | "startsAt" | "capacity">>) {
  return rooms.map((room) => {
    if (room.id !== roomId) return room
    const changed = Object.entries(patch).some(([key, value]) => room[key as keyof RoomRecord] !== value)
    return { ...room, ...patch, publishedVersion: room.published && changed ? room.publishedVersion + 1 : room.publishedVersion }
  })
}

export function transferRoomPlayer(rooms: RoomRecord[], eventId: string, roundId: string, playerId: string, targetRoomId: string) {
  const target = rooms.find((room) => room.id === targetRoomId && room.eventId === eventId && room.roundId === roundId)
  if (!target) return { rooms, error: "Room not found for this tournament round." }
  const source = rooms.find((room) => room.eventId === eventId && room.roundId === roundId && room.playerIds.includes(playerId))
  if (source?.id === target.id) return { rooms, error: "Player is already assigned to this room." }
  if (target.playerIds.length >= target.capacity) return { rooms, error: "Room is at capacity." }
  return {
    rooms: rooms.map((room) => {
      if (room.id === source?.id) return { ...room, playerIds: room.playerIds.filter((id) => id !== playerId), publishedVersion: room.published ? room.publishedVersion + 1 : room.publishedVersion }
      if (room.id === target.id) return { ...room, playerIds: [...room.playerIds, playerId], publishedVersion: room.published ? room.publishedVersion + 1 : room.publishedVersion }
      return room
    }),
    error: null,
  }
}

export function removeRoomPlayer(rooms: RoomRecord[], eventId: string, roundId: string, playerId: string) {
  const source = rooms.find((room) => room.eventId === eventId && room.roundId === roundId && room.playerIds.includes(playerId))
  if (!source) return { rooms, error: "Player is not assigned to a room in this round." }
  return { rooms: rooms.map((room) => room.id === source.id ? { ...room, playerIds: room.playerIds.filter((id) => id !== playerId), publishedVersion: room.published ? room.publishedVersion + 1 : room.publishedVersion } : room), error: null }
}

export function setRoomPublished(rooms: RoomRecord[], roomId: string, publish: boolean) {
  return rooms.map((room) => room.id === roomId ? { ...room, published: publish, publishedVersion: publish ? room.publishedVersion + 1 : room.publishedVersion } : room)
}

export function activeRoomNotices(rooms: RoomAssignment[], dismissedKeys: string[], now = new Date()) {
  const today = currentEventDate(now)
  return rooms.filter((room) => room.published && room.eventDate === today && !dismissedKeys.includes(roomNoticeKey(room)))
}

export function formatToPar(score: number | null) {
  if (score === null) return "Not Played"
  if (score === 0) return "E"
  return score > 0 ? `+${score}` : `${score}`
}

export type ScoreDisplayStatus = "live" | "verified" | "missing"

export function scoreDisplayStatus(scoreKind: "provisional" | "official" | null): ScoreDisplayStatus {
  if (scoreKind === "official") return "verified"
  return scoreKind === "provisional" ? "live" : "missing"
}

export function combinedScoreDisplayStatus(scoreKinds: Array<"provisional" | "official" | null>): ScoreDisplayStatus {
  const recorded = scoreKinds.filter((kind): kind is "provisional" | "official" => kind !== null)
  if (!recorded.length) return "missing"
  return recorded.every((kind) => kind === "official") ? "verified" : "live"
}

export function formatRoundDate(round: RoundConfig) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${round.date}T12:00:00Z`))
}

export function dateTimeInputInZone(value: string, timeZone: string) {
  if (!value) return ""
  const instant = new Date(value)
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instant)
  const part = (name: string) => parts.find((item) => item.type === name)?.value || "00"
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`
}

export function dateTimeInputToUtc(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute] = match
  const target = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
  let guess = target
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess))
    const part = (name: string) => Number(parts.find((item) => item.type === name)?.value || 0)
    const represented = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"))
    guess += target - represented
  }
  return new Date(guess).toISOString()
}
