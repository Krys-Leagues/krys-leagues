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

export function validateDoublesTeamSelection(players: AuthoritativeDoublesPlayer[], playerOneId: unknown, playerTwoId: unknown) {
  const ids = validateDoublesPlayerIds(playerOneId, playerTwoId)
  if (!ids.ok) return ids

  const available = new Set(players.map((player) => player.id))
  if (!available.has(ids.playerOneId) || !available.has(ids.playerTwoId)) {
    return { ok: false as const, error: "Selected players are not in the authoritative Doubles roster. Reload the roster and try again." }
  }
  return ids
}
