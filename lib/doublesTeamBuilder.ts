export type AuthoritativeDoublesPlayer = {
  id: string
  display_name: string
}

export function normalizeOptionalSeasonId(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized === "" ? null : normalized
}

const canonicalPlayerUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isCanonicalPlayerUuid(value: unknown): value is string {
  return typeof value === "string" && canonicalPlayerUuid.test(value)
}

export function normalizeAuthoritativeDoublesPlayers(value: unknown): AuthoritativeDoublesPlayer[] {
  if (!Array.isArray(value)) return []

  const players = new Map<string, AuthoritativeDoublesPlayer>()
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue
    const row = candidate as { id?: unknown; display_name?: unknown }
    if (!isCanonicalPlayerUuid(row.id) || typeof row.display_name !== "string" || row.display_name.trim() === "") continue
    if (!players.has(row.id)) players.set(row.id, { id: row.id, display_name: row.display_name })
  }
  return [...players.values()]
}

export function validateDoublesPlayerIds(playerOneId: unknown, playerTwoId: unknown): { ok: true; playerOneId: string; playerTwoId: string } | { ok: false; error: string } {
  if (!isCanonicalPlayerUuid(playerOneId) || !isCanonicalPlayerUuid(playerTwoId)) {
    return { ok: false, error: "Select two valid Doubles roster players before saving." }
  }
  if (playerOneId === playerTwoId) {
    return { ok: false, error: "Choose two distinct Doubles roster players." }
  }
  return { ok: true, playerOneId, playerTwoId }
}

export function validateDoublesRequiredUuid(value: unknown, label: string): { ok: true; value: string } | { ok: false; error: string } {
  if (!isCanonicalPlayerUuid(value)) return { ok: false, error: `${label} must be a valid UUID.` }
  return { ok: true, value }
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export function validateDoublesSeasonAssignment(input: { globalTeamId: unknown; division: unknown; orderPosition: unknown }) {
  const team = validateDoublesRequiredUuid(input.globalTeamId, "Global team ID")
  if (!team.ok) return team
  const division = typeof input.division === "string" ? input.division.trim() : ""
  if (!division) return { ok: false as const, error: "Division is required for season assignment." }
  const orderPosition = positiveInteger(input.orderPosition)
  if (orderPosition === null) return { ok: false as const, error: "Order position must be a positive integer." }
  return { ok: true as const, globalTeamId: team.value, division, orderPosition }
}

export function validateDoublesFixtureInput(input: {
  seasonId: unknown
  division: unknown
  gameNumber: unknown
  homeSeasonTeamId: unknown
  awaySeasonTeamId: unknown
  homeCourse: unknown
  awayCourse: unknown
}) {
  const season = validateDoublesRequiredUuid(input.seasonId, "Season ID")
  if (!season.ok) return season
  const homeTeam = validateDoublesRequiredUuid(input.homeSeasonTeamId, "Home season team ID")
  if (!homeTeam.ok) return homeTeam
  const awayTeam = validateDoublesRequiredUuid(input.awaySeasonTeamId, "Away season team ID")
  if (!awayTeam.ok) return awayTeam
  if (homeTeam.value === awayTeam.value) return { ok: false as const, error: "Home and away season teams must be distinct." }
  const division = typeof input.division === "string" ? input.division.trim() : ""
  if (!division) return { ok: false as const, error: "Division is required for a fixture." }
  const gameNumber = positiveInteger(input.gameNumber)
  if (gameNumber === null) return { ok: false as const, error: "Game number must be a positive integer." }
  const homeCourse = typeof input.homeCourse === "string" ? input.homeCourse.trim() : ""
  const awayCourse = typeof input.awayCourse === "string" ? input.awayCourse.trim() : ""
  if (!homeCourse || !awayCourse) return { ok: false as const, error: "Both actual course names are required." }
  return { ok: true as const, seasonId: season.value, division, gameNumber, homeSeasonTeamId: homeTeam.value, awaySeasonTeamId: awayTeam.value, homeCourse, awayCourse }
}

export function validateDoublesTeamSelection(players: AuthoritativeDoublesPlayer[], playerOneId: unknown, playerTwoId: unknown) {
  const ids = validateDoublesPlayerIds(playerOneId, playerTwoId)
  if (!ids.ok) return ids

  const available = new Set(players.map((player) => player.id))
  if (!available.has(ids.playerOneId) || !available.has(ids.playerTwoId)) {
    return { ok: false as const, error: "Selected players are not in the authoritative Doubles roster. Reload the roster and try again." }
  }
  return ids
}
