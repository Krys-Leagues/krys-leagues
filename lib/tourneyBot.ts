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
  artworkUrl: string | null
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

function publicUrl(value: unknown): string | null {
  const url = stringValue(value)
  return url && /^https?:\/\//i.test(url) ? url : null
}

function participantLookup(values: unknown[]) {
  const lookup = new Map<string, string>()
  for (const value of values) {
    const object = objectValue(value)
    const name = displayName(value)
    const id = object && firstString(object, ["id", "userId", "user_id", "playerId", "player_id", "teamId", "team_id"])
    if (id && name) lookup.set(id, name)
  }
  return lookup
}

function gameParticipant(value: unknown, lookup: Map<string, string>): string | null {
  const object = objectValue(value)
  if (!object) return lookup.get(stringValue(value) || "") || displayName(value)
  return displayName(value) || lookup.get(firstString(object, ["id", "userId", "user_id", "playerId", "player_id", "teamId", "team_id"]) || "") || null
}

function gameScore(value: unknown) {
  const object = objectValue(value)
  return object ? firstString(object, ["score", "points", "result"]) : null
}

function normalizeGame(value: unknown, lookup: Map<string, string>): TourneyBotMatch | null {
  const object = objectValue(value)
  if (!object) return null
  const playerOne = gameParticipant(object.playerOne ?? object.player_one ?? object.player1 ?? object.player_1 ?? object.home ?? object.left, lookup)
  const playerTwo = gameParticipant(object.playerTwo ?? object.player_two ?? object.player2 ?? object.player_2 ?? object.away ?? object.right, lookup)
  const winner = firstString(object, ["winner", "winnerId", "winner_id"])
  const status = firstString(object, ["status", "state", "result"]) || (winner ? "Complete" : "Pending")
  return {
    playerOne,
    playerTwo,
    scoreOne: firstString(object, ["scoreOne", "score_one", "score1", "score_1", "homeScore", "home_score"]) || gameScore(object.playerOne ?? object.player_one ?? object.player1 ?? object.player_1),
    scoreTwo: firstString(object, ["scoreTwo", "score_two", "score2", "score_2", "awayScore", "away_score"]) || gameScore(object.playerTwo ?? object.player_two ?? object.player2 ?? object.player_2),
    status,
  }
}

function normalizeRound(value: unknown, index: number, lookup: Map<string, string>): TourneyBotRound | null {
  const object = objectValue(value)
  if (!object) return null
  const matches = firstArray(object, ["matches", "matchups", "games", "pairings"]).map((match) => normalizeGame(match, lookup)).filter((match): match is TourneyBotMatch => Boolean(match))
  return { name: firstString(object, ["name", "title", "label", "roundName", "round_name"]) || `Round ${index + 1}`, matches }
}

function normalizeStanding(value: unknown): TourneyBotStanding | null {
  const object = objectValue(value)
  if (!object) return null
  const name = displayName(value)
  return name ? { place: firstString(object, ["place", "position", "rank", "seed"]), name, score: firstString(object, ["score", "result", "points"]) } : null
}

function statusLabel(value: unknown) {
  if (typeof value === "number") return value === 3 ? "Live" : value === 4 ? "Complete" : value === 2 ? "Started" : String(value)
  return stringValue(value) || "Live"
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
  const root = objectValue(data)
  const props = root && objectValue(root.props)
  const pageProps = props && objectValue(props.pageProps)
  const tournament = (pageProps && objectValue(pageProps.tourney)) || findById(data, config.id) || objectValue(data) || {}
  const source = pageProps || tournament
  const participantValues = firstArray(source, ["players", "participants", "entrants", "members", "teams"])
  const teams = firstArray(source, ["teams"])
  const lookup = participantLookup([...participantValues, ...teams])
  const participants = participantValues.map(displayName).filter((name): name is string => Boolean(name))
  const games = firstArray(source, ["games", "matches", "matchups", "pairings"])
  const rounds = games.length > 0
    ? [...new Set(games.map((game) => firstNumber(objectValue(game) || {}, ["round"]) ?? 0))].sort((a, b) => a - b).map((roundNumber) => ({
      name: roundNumber ? `Round ${roundNumber}` : "Live Bracket",
      matches: games.filter((game) => (firstNumber(objectValue(game) || {}, ["round"]) ?? 0) === roundNumber).map((game) => normalizeGame(game, lookup)).filter((match): match is TourneyBotMatch => Boolean(match)),
    }))
    : firstArray(tournament, ["rounds", "bracketRounds", "bracket_rounds"]).map((round, index) => normalizeRound(round, index, lookup)).filter((round): round is TourneyBotRound => Boolean(round))
  const standings = firstArray(source, ["standings", "finalStandings", "final_standings", "leaderboard", "results"]).map(normalizeStanding).filter((standing): standing is TourneyBotStanding => Boolean(standing))
  return {
    id: config.id,
    name: firstString(tournament, ["name", "title", "tournamentName", "tournament_name"]) || config.name,
    url: config.url,
    status: statusLabel(tournament.status ?? tournament.state ?? tournament.tournamentStatus ?? tournament.tournament_status),
    participantCount: firstNumber(tournament, ["participant_size", "participantSize", "participantCount", "participant_count", "playerCount", "player_count", "entrantCount", "entrant_count"]) ?? (participants.length || null),
    participants,
    rounds,
    standings,
    champion: firstString(tournament, ["champion", "winner", "winnerName", "winner_name"]),
    artworkUrl: publicUrl(firstString(tournament, ["trophyUrl", "trophy_url", "artworkUrl", "artwork_url", "bannerUrl", "banner_url"])),
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
      artworkUrl: null,
      available: false,
      error: "Live bracket preview is temporarily unavailable.",
    }
  }
}
