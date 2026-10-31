export type CardPlayer = {
  id: string
  holeStrokes: number[]
}

export type CardEffect = {
  playerId: string
  totalStrokes: number
  score: number
  oldPbScore: number | null
  classification: "FIRST" | "BETTER" | "EQUAL" | "WORSE"
  newPbScore: number | null
  passedPlayerIds: string[]
  points: number
}

export function calculateCardTotals(holeStrokes: number[], coursePar: number | null) {
  if (holeStrokes.length !== 18 || holeStrokes.some((strokes) => !Number.isInteger(strokes) || strokes < 1)) {
    throw new Error("A card requires 18 positive whole-number hole scores")
  }
  if (coursePar === null) throw new Error("An authoritative total course par is required")
  const totalStrokes = holeStrokes.reduce((total, strokes) => total + strokes, 0)
  return { totalStrokes, score: totalStrokes - coursePar, hioCount: holeStrokes.filter((strokes) => strokes === 1).length }
}

export function holeParStatsAvailable(holePars: number[] | null, coursePar: number | null) {
  return holePars !== null
    && holePars.length === 18
    && holePars.every((par) => Number.isInteger(par) && par > 0)
    && coursePar !== null
    && holePars.reduce((total, par) => total + par, 0) === coursePar
}

export function calculateAtomicCardEffects(
  preCardBest: Array<{ playerId: string; score: number }>,
  coursePar: number | null,
  players: CardPlayer[],
): CardEffect[] {
  if (new Set(players.map((player) => player.id)).size !== players.length) {
    throw new Error("A card cannot contain the same canonical player more than once")
  }
  const snapshot = new Map(preCardBest.map((row) => [row.playerId, row.score]))
  const effects = players.map((player) => {
    const totals = calculateCardTotals(player.holeStrokes, coursePar)
    const oldPbScore = snapshot.get(player.id) ?? null
    const classification: CardEffect["classification"] = oldPbScore === null ? "FIRST" : totals.score < oldPbScore ? "BETTER" : totals.score === oldPbScore ? "EQUAL" : "WORSE"
    const passedPlayerIds = classification === "BETTER"
      ? [...snapshot.entries()].filter(([candidate, score]) => candidate !== player.id && score > totals.score).map(([candidate]) => candidate).sort()
      : []
    return {
      playerId: player.id,
      totalStrokes: totals.totalStrokes,
      score: totals.score,
      oldPbScore,
      classification,
      newPbScore: classification === "FIRST" || classification === "BETTER" ? totals.score : oldPbScore,
      passedPlayerIds,
      points: classification === "BETTER" ? passedPlayerIds.length : 0,
    }
  })
  return effects
}
