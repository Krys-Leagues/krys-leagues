export type OpponentKind = "player" | "bye" | "unknown"

export type PairingAppearance = {
  id: string
  standingId: string
  importId: string
  divisionNumber: number
  courseOrder: number
  courseName: string
  historicalDisplayName: string
  played: boolean
  score: number | null
  rawScoreToken: string
  outcome: "W" | "L" | "D" | null
}

export type PairingChoice = {
  appearanceId: string
  kind: OpponentKind
  opponentStandingId: string | null
  note: string | null
}

export type PairingState = Record<string, PairingChoice>

export function assignOpponent(
  current: PairingState,
  appearances: PairingAppearance[],
  appearanceId: string,
  kind: OpponentKind,
  opponentStandingId: string | null = null,
): PairingState {
  const appearance = appearances.find((item) => item.id === appearanceId)
  if (!appearance) throw new Error("Historical Stroke appearance was not found.")
  const existing = current[appearanceId]
  if (existing) {
    const unchanged = existing.kind === kind
      && (kind !== "player" || existing.opponentStandingId === opponentStandingId)
    if (unchanged) return current
    throw new Error("This appearance is already reviewed. Clear Pairing before replacing it.")
  }
  const next = clearPairing(current, appearances, appearanceId)

  if (kind !== "player") {
    return { ...next, [appearanceId]: { appearanceId, kind, opponentStandingId: null, note: null } }
  }
  if (!opponentStandingId || opponentStandingId === appearance.standingId) {
    throw new Error("A player cannot be paired with themself.")
  }
  const opponent = appearances.find((item) => item.standingId === opponentStandingId
    && item.importId === appearance.importId
    && item.divisionNumber === appearance.divisionNumber
    && item.courseOrder === appearance.courseOrder)
  if (!opponent) throw new Error("Opponent must be in the same import, division, and course/game.")
  const occupied = next[opponent.id]
  if (occupied) throw new Error("That player already has a reviewed assignment for this course/game. Clear it first.")

  return {
    ...next,
    [appearance.id]: { appearanceId: appearance.id, kind: "player", opponentStandingId, note: null },
    [opponent.id]: { appearanceId: opponent.id, kind: "player", opponentStandingId: appearance.standingId, note: null },
  }
}

export function clearPairing(current: PairingState, appearances: PairingAppearance[], appearanceId: string): PairingState {
  const next = { ...current }
  const choice = next[appearanceId]
  delete next[appearanceId]
  if (choice?.kind === "player" && choice.opponentStandingId) {
    const appearance = appearances.find((item) => item.id === appearanceId)
    const reciprocal = appearances.find((item) => item.standingId === choice.opponentStandingId
      && item.importId === appearance?.importId
      && item.courseOrder === appearance?.courseOrder)
    if (reciprocal) delete next[reciprocal.id]
  }
  return next
}

export function pairingWarnings(state: PairingState, appearances: PairingAppearance[]): string[] {
  const byId = new Map(appearances.map((item) => [item.id, item]))
  const byStandingAndGame = new Map(appearances.map((item) => [`${item.standingId}:${item.courseOrder}`, item]))
  const warnings: string[] = []
  const seen = new Set<string>()
  for (const choice of Object.values(state)) {
    if (choice.kind !== "player" || !choice.opponentStandingId) continue
    const left = byId.get(choice.appearanceId)
    if (!left) continue
    const right = byStandingAndGame.get(`${choice.opponentStandingId}:${left.courseOrder}`)
    if (!right) continue
    const key = [left.id, right.id].sort().join(":")
    if (seen.has(key)) continue
    seen.add(key)
    if (left.played !== right.played) warnings.push(`${left.historicalDisplayName} / ${right.historicalDisplayName}: played states differ.`)
    if (!left.played || !right.played) continue
    const outcomesAgree = (left.outcome === "W" && right.outcome === "L")
      || (left.outcome === "L" && right.outcome === "W")
      || (left.outcome === "D" && right.outcome === "D")
    if (!outcomesAgree) warnings.push(`${left.historicalDisplayName} / ${right.historicalDisplayName}: source outcomes do not reconcile.`)
    if (left.score !== null && right.score !== null) {
      const scoresAgree = left.score === right.score
        ? left.outcome === "D" && right.outcome === "D"
        : left.score < right.score ? left.outcome === "W" : right.outcome === "W"
      if (!scoresAgree) warnings.push(`${left.historicalDisplayName} / ${right.historicalDisplayName}: source scores and outcomes do not reconcile.`)
    }
  }
  return warnings
}

export function serializePairingState(state: PairingState) {
  return Object.values(state).sort((a, b) => a.appearanceId.localeCompare(b.appearanceId)).map((choice) => ({
    appearance_id: choice.appearanceId,
    opponent_kind: choice.kind,
    opponent_standing_id: choice.opponentStandingId,
    admin_note: choice.note,
  }))
}

export function pairingCounts(state: PairingState, total: number) {
  const values = Object.values(state)
  return {
    total,
    reviewed: values.length,
    unreviewed: total - values.length,
    player: values.filter((item) => item.kind === "player").length,
    bye: values.filter((item) => item.kind === "bye").length,
    unknown: values.filter((item) => item.kind === "unknown").length,
  }
}
