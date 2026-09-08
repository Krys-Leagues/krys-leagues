export type TourneyBotMatch = {
  playerOne: string | null
  playerTwo: string | null
  scoreOne: string | null
  scoreTwo: string | null
  status: string | null
}

export type TourneyBotRound = {
  name: string
  matches: TourneyBotMatch[]
}

export type TourneyBotStanding = {
  place: string | null
  name: string
  score: string | null
}

export type TourneyBotPreview = {
  id: string
  name: string
  url: string
  status: string
  participantCount: number | null
  participants: string[]
  rounds: TourneyBotRound[]
  standings: TourneyBotStanding[]
  champion: string | null
  available: boolean
  error: string | null
}

export type TourneyBotConfig = { id: string; name: string; url: string }

export const CURRENT_TOURNAMENTS: readonly TourneyBotConfig[] = [
  { id: "71394", name: "The Decider From Hell", url: "https://tourneybot.gg/tourneys/71394" },
  { id: "72111", name: "Hot-N-Sticky", url: "https://tourneybot.gg/tourneys/72111" },
]

export const ARCHIVED_TOURNAMENTS: readonly TourneyBotConfig[] = [
  { id: "71112", name: "The OG Challenge Cup", url: "https://tourneybot.gg/tourneys/71112" },
]

type JsonObject = Record<string, unknown>

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : null
}

function firstString(object: JsonObject, keys: string[]) {
  for (const key of keys) {
    const value = stringValue(object[key])
    if (value) return value
  }
  return null
}

function firstNumber(object: JsonObject, keys: string[]) {
  for (const key of keys) {
    const value = object[key]
    const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN
    if (Number.isFinite(number)) return number
  }
  return null
}

function firstArray(object: JsonObject, keys: string[]) {
  for (const key of keys) if (Array.isArray(object[key])) return object[key] as unknown[]
  return []
}

function findById(value: unknown, id: string): JsonObject | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findById(item, id)
      if (found) return found
    }
    return null
  }
  const object = objectValue(value)
  if (!object) return null
  const objectId = firstString(object, ["id", "tournamentId", "tournament_id", "tourneyId", "tourney_id"])
  if (objectId === id) return object
  for (const child of Object.values(object)) {
    const found = findById(child, id)
    if (found) return found
  }
  return null
}

function displayName(value: unknown): string | null {
  const object = objectValue(value)
  return object ? firstString(object, ["screenName", "screen_name", "displayName", "display_name", "username", "playerName", "player_name", "name"]) : stringValue(value)
}

function normalizeMatch(value: unknown): TourneyBotMatch | null {
  const object = objectValue(value)
  if (!object) return null
  return {
    playerOne: displayName(object.playerOne ?? object.player_one ?? object.player1 ?? object.player_1 ?? object.home ?? object.left),
    playerTwo: displayName(object.playerTwo ?? object.player_two ?? object.player2 ?? object.player_2 ?? object.away ?? object.right),
    scoreOne: firstString(object, ["scoreOne", "score_one", "score1", "score_1", "homeScore", "home_score"]),
    scoreTwo: firstString(object, ["scoreTwo", "score_two", "score2", "score_2", "awayScore", "away_score"]),
    status: firstString(object, ["status", "state", "result"]),
  }
}

function normalizeRound(value: unknown, index: number): TourneyBotRound | null {
  const object = objectValue(value)
  if (!object) return null
  const matches = firstArray(object, ["matches", "matchups", "games", "pairings"]).map(normalizeMatch).filter((match): match is TourneyBotMatch => Boolean(match))
  return { name: firstString(object, ["name", "title", "label", "roundName", "round_name"]) || `Round ${index + 1}`, matches }
}

function normalizeStanding(value: unknown): TourneyBotStanding | null {
  const object = objectValue(value)
  if (!object) return null
  const name = displayName(value)
  return name ? { place: firstString(object, ["place", "position", "rank", "seed"]), name, score: firstString(object, ["score", "result", "points"]) } : null
}

export function extractTourneyBotNextData(html: string): unknown {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
  if (!match) throw new Error("Tourney Bot public data was not found")
  try {
    return JSON.parse(match[1])
  } catch {
    throw new Error("Tourney Bot public data was malformed")
  }
}

export function normalizeTourneyBotData(data: unknown, config: TourneyBotConfig): TourneyBotPreview {
  const tournament = findById(data, config.id) || objectValue(data) || {}
  const participantValues = firstArray(tournament, ["participants", "players", "entrants", "members"])
  const participants = participantValues.map(displayName).filter((name): name is string => Boolean(name))
  const rounds = firstArray(tournament, ["rounds", "bracketRounds", "bracket_rounds"]).map(normalizeRound).filter((round): round is TourneyBotRound => Boolean(round))
  const standings = firstArray(tournament, ["standings", "finalStandings", "final_standings", "leaderboard", "results"]).map(normalizeStanding).filter((standing): standing is TourneyBotStanding => Boolean(standing))
  return {
    id: config.id,
    name: firstString(tournament, ["name", "title", "tournamentName", "tournament_name"]) || config.name,
    url: config.url,
    status: firstString(tournament, ["status", "state", "tournamentStatus", "tournament_status"]) || "Live",
    participantCount: firstNumber(tournament, ["participantCount", "participant_count", "playerCount", "player_count", "entrantCount", "entrant_count"]) ?? (participants.length || null),
    participants,
    rounds,
    standings,
    champion: firstString(tournament, ["champion", "winner", "winnerName", "winner_name"]),
    available: true,
    error: null,
  }
}

export async function fetchTourneyBotPreview(config: TourneyBotConfig): Promise<TourneyBotPreview> {
  try {
    const response = await fetch(config.url, {
      headers: { accept: "text/html" },
      next: { revalidate: 60 },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return normalizeTourneyBotData(extractTourneyBotNextData(await response.text()), config)
  } catch {
    return {
      id: config.id,
      name: config.name,
      url: config.url,
      status: "Unavailable",
      participantCount: null,
      participants: [],
      rounds: [],
      standings: [],
      champion: null,
      available: false,
      error: "Live bracket preview is temporarily unavailable.",
    }
  }
}
