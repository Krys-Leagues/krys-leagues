import { formatMajorToPar, type MajorPlayerScorecard, type MajorResultsPayload, type MajorScorecardStatus } from "./majors.ts"

export type MastersBoardView = "easy" | "hard" | "overall"
export type MastersRoundNumber = 1 | 2 | 3 | 4

export type MastersLiveRoundScore = {
  cardId: string | null
  status: MajorScorecardStatus | null
  toPar: number | null
}

export type MastersLiveRow = {
  entryId: string
  playerId: string
  name: string
  rounds: Record<MastersRoundNumber, MastersLiveRoundScore>
  easyTotal: number | null
  hardTotal: number | null
  overallTotal: number | null
  overallPlace: string | null
  provisional: boolean
}

const ROUND_NUMBERS = [1, 2, 3, 4] as const

function blankRounds(): MastersLiveRow["rounds"] {
  return {
    1: { cardId: null, status: null, toPar: null },
    2: { cardId: null, status: null, toPar: null },
    3: { cardId: null, status: null, toPar: null },
    4: { cardId: null, status: null, toPar: null },
  }
}

function cardToPar(card: MajorPlayerScorecard) {
  if (typeof card.score_to_par === "number") return card.score_to_par
  if (!card.holes?.length) return null
  return card.holes.reduce((total, hole) => total + hole.strokes - hole.par, 0)
}

function completedPairTotal(row: MastersLiveRow, first: MastersRoundNumber, second: MastersRoundNumber) {
  const firstScore = row.rounds[first].toPar
  const secondScore = row.rounds[second].toPar
  return firstScore === null || secondScore === null ? null : firstScore + secondScore
}

function placementNumber(place: string | null) {
  return place ? Number(place.replace("T", "")) : Number.POSITIVE_INFINITY
}

export function buildMastersLiveRows(payload: MajorResultsPayload): MastersLiveRow[] {
  const rows = new Map<string, MastersLiveRow>()

  for (const entrant of payload.entrants ?? []) {
    rows.set(entrant.entry_id, {
      entryId: entrant.entry_id,
      playerId: entrant.player_id,
      name: entrant.player_screen_name_snapshot,
      rounds: blankRounds(),
      easyTotal: null,
      hardTotal: null,
      overallTotal: null,
      overallPlace: null,
      provisional: false,
    })
  }

  for (const round of payload.rounds) {
    for (const card of round.cards) {
      const existing = rows.get(card.entry_id) ?? {
        entryId: card.entry_id,
        playerId: card.player_id,
        name: card.player_screen_name_snapshot,
        rounds: blankRounds(),
        easyTotal: null,
        hardTotal: null,
        overallTotal: null,
        overallPlace: null,
        provisional: false,
      }
      const roundNumber = card.day_number as MastersRoundNumber
      const current = existing.rounds[roundNumber]
      if (!current.cardId || (current.status !== "verified" && card.status === "verified")) {
        existing.rounds[roundNumber] = {
          cardId: card.id,
          status: card.status,
          toPar: cardToPar(card),
        }
      }
      existing.name = card.player_screen_name_snapshot
      existing.playerId = card.player_id
      rows.set(card.entry_id, existing)
    }
  }

  const result = [...rows.values()]

  for (const row of result) {
    row.easyTotal = completedPairTotal(row, 1, 2)
    row.hardTotal = completedPairTotal(row, 3, 4)
    row.provisional = ROUND_NUMBERS.some((round) => row.rounds[round].toPar !== null && row.rounds[round].status !== "verified")
    const recordedScores = ROUND_NUMBERS
      .map((round) => row.rounds[round].toPar)
      .filter((score): score is number => score !== null)
    row.overallTotal = recordedScores.length > 0
      ? recordedScores.reduce((total, score) => total + score, 0)
      : null
  }

  const ranked = result
    .filter((row) => row.overallTotal !== null)
    .toSorted((a, b) => (a.overallTotal ?? 0) - (b.overallTotal ?? 0) || a.name.localeCompare(b.name))
  const ties = new Map<number, number>()
  for (const row of ranked) ties.set(row.overallTotal!, (ties.get(row.overallTotal!) ?? 0) + 1)

  let previousTotal: number | null = null
  let currentPlace = 0
  ranked.forEach((row, index) => {
    if (row.overallTotal !== previousTotal) currentPlace = index + 1
    row.overallPlace = `${(ties.get(row.overallTotal!) ?? 0) > 1 ? "T" : ""}${currentPlace}`
    previousTotal = row.overallTotal
  })

  return result
}

export function sortMastersLiveRows(rows: MastersLiveRow[], view: MastersBoardView) {
  if (view === "overall") {
    return rows.toSorted((a, b) => placementNumber(a.overallPlace) - placementNumber(b.overallPlace) || a.name.localeCompare(b.name))
  }
  const totalKey = view === "easy" ? "easyTotal" : "hardTotal"
  const roundPair: MastersRoundNumber[] = view === "easy" ? [1, 2] : [3, 4]
  return rows.toSorted((a, b) => {
    const aComplete = a[totalKey] !== null
    const bComplete = b[totalKey] !== null
    if (aComplete !== bComplete) return aComplete ? -1 : 1
    if (aComplete && bComplete && a[totalKey] !== b[totalKey]) return a[totalKey]! - b[totalKey]!
    const aPlayed = roundPair.filter((round) => a.rounds[round].toPar !== null).length
    const bPlayed = roundPair.filter((round) => b.rounds[round].toPar !== null).length
    return bPlayed - aPlayed || a.name.localeCompare(b.name)
  })
}

export function formatMastersLiveScore(value: number | null) {
  return value === null ? "—" : formatMajorToPar(value)
}
