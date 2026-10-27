import { formatMajorToPar } from "./majors.ts"

export const MASTERS_SPLIT_CUT_LINE = -47
export const MASTERS_ROUND_NUMBERS = [1, 2, 3, 4] as const

export type MastersSplitRoundNumber = (typeof MASTERS_ROUND_NUMBERS)[number]
export type MastersSplitGroup = "top_60" | "bottom_40" | null

export type MastersSplitRound = {
  score: number | null
  status: string | null
}

export type MastersSplitPlayer = {
  entryId: string
  playerId: string
  name: string
  entryStatus: string | null
  rounds: Record<MastersSplitRoundNumber, MastersSplitRound>
}

export type MastersSplitRow = MastersSplitPlayer & {
  group: MastersSplitGroup
  round2Total: number | null
  overall: number | null
  completedRoundCount: number
  resultStatus: "COMPLETE" | "INCOMPLETE" | "WITHDRAWN"
  rank: string | null
  rankingPoints: null
}

export type MastersSplitLeaderboards = {
  eligiblePlayers: MastersSplitRow[]
  top60: MastersSplitRow[]
  bottom40: MastersSplitRow[]
  unclassified: MastersSplitRow[]
  cutLine: number
}

function compareNames(left: MastersSplitPlayer, right: MastersSplitPlayer) {
  return left.name.localeCompare(right.name) || left.entryId.localeCompare(right.entryId)
}

function scoreTotal(player: MastersSplitPlayer) {
  const scores = MASTERS_ROUND_NUMBERS
    .map((round) => player.rounds[round].score)
    .filter((score): score is number => typeof score === "number")

  return scores.length ? scores.reduce((total, score) => total + score, 0) : null
}

function completedRoundCount(player: MastersSplitPlayer) {
  return MASTERS_ROUND_NUMBERS.filter((round) => typeof player.rounds[round].score === "number").length
}

function toRow(player: MastersSplitPlayer, group: MastersSplitGroup): MastersSplitRow {
  const completed = completedRoundCount(player)
  return {
    ...player,
    group,
    round2Total: player.rounds[2].score === null || player.rounds[1].score === null
      ? null
      : player.rounds[1].score + player.rounds[2].score,
    overall: scoreTotal(player),
    completedRoundCount: completed,
    resultStatus: player.entryStatus === "withdrawn" ? "WITHDRAWN" : completed === 4 ? "COMPLETE" : "INCOMPLETE",
    rank: null,
    rankingPoints: null,
  }
}

function rankWithinGroup(rows: MastersSplitRow[]) {
  const ordered = rows.toSorted((left, right) => {
    const leftOverall = left.overall
    const rightOverall = right.overall
    if (leftOverall === null && rightOverall === null) return compareNames(left, right)
    if (leftOverall === null) return 1
    if (rightOverall === null) return -1
    return leftOverall - rightOverall || compareNames(left, right)
  })

  let previousOverall: number | null = null
  let currentRank = 0
  return ordered.map((row, index) => {
    if (row.overall !== previousOverall) currentRank = index + 1
    const tied = row.overall !== null && ordered.filter((candidate) => candidate.overall === row.overall).length > 1
    previousOverall = row.overall
    return { ...row, rank: row.overall === null ? null : `${tied ? "T" : ""}${currentRank}` }
  })
}

export function buildMastersSplitLeaderboards(
  players: MastersSplitPlayer[],
  cutLine = MASTERS_SPLIT_CUT_LINE,
): MastersSplitLeaderboards {
  const eligiblePlayers = players
    .filter((player) => player.rounds[1].score !== null && player.rounds[2].score !== null)
    .map((player) => toRow(player, null))

  const top60 = rankWithinGroup(
    eligiblePlayers
      .filter((player) => (player.round2Total ?? Number.POSITIVE_INFINITY) <= cutLine)
      .map((player) => ({ ...player, group: "top_60" as const })),
  )
  const bottom40 = rankWithinGroup(
    eligiblePlayers
      .filter((player) => (player.round2Total ?? Number.NEGATIVE_INFINITY) > cutLine)
      .map((player) => ({ ...player, group: "bottom_40" as const })),
  )

  const classifiedIds = new Set([...top60, ...bottom40].map((player) => player.entryId))
  const unclassified = players
    .filter((player) => !classifiedIds.has(player.entryId))
    .map((player) => toRow(player, null))
    .toSorted(compareNames)

  return {
    eligiblePlayers: [...top60, ...bottom40],
    top60,
    bottom40,
    unclassified,
    cutLine,
  }
}

export function formatMastersSplitScore(value: number | null) {
  return value === null ? "—" : formatMajorToPar(value)
}
