export type MajorRankingPoint = {
  position: number
  points: number
}

export type MajorRankingFinish = {
  playerId: string
  position: number
  tieSize?: number
}

export const MAJOR_RANKING_POINTS: ReadonlyArray<MajorRankingPoint> = [
  [1, 200], [2, 185], [3, 175], [4, 165], [5, 155], [6, 148], [7, 142], [8, 136], [9, 130], [10, 125],
  [11, 120], [12, 116], [13, 112], [14, 108], [15, 104], [16, 101], [17, 98], [18, 95], [19, 93], [20, 90],
  [21, 87], [22, 84], [23, 81], [24, 78], [25, 75], [26, 73], [27, 71], [28, 69], [29, 67], [30, 65],
  [31, 63], [32, 61], [33, 59], [34, 56], [35, 53], [36, 50], [37, 48], [38, 46], [39, 44], [40, 42],
  [41, 40], [42, 38], [43, 36], [44, 34], [45, 32], [46, 31], [47, 30], [48, 29], [49, 28], [50, 27],
  [51, 25], [52, 23], [53, 21], [54, 20],
].map(([position, points]) => ({ position, points }))

const pointsByPosition = new Map(MAJOR_RANKING_POINTS.map((entry) => [entry.position, entry.points]))

export function majorRankingPointsForPosition(position: number) {
  return Number.isInteger(position) && position >= 1 && position <= MAJOR_RANKING_POINTS.length
    ? pointsByPosition.get(position) ?? null
    : null
}

export function majorRankingPointsForTie(startPosition: number, tieSize = 1) {
  if (!Number.isInteger(startPosition) || startPosition < 1 || !Number.isInteger(tieSize) || tieSize < 1) return null
  const occupiedPositions = Array.from({ length: tieSize }, (_, index) => startPosition + index)
  const points = occupiedPositions.map(majorRankingPointsForPosition)
  if (points.some((value) => value === null)) return null
  const numericPoints = points as number[]
  return numericPoints.reduce((total, value) => total + value, 0) / tieSize
}

export function nextMajorRankingPositionAfterTie(startPosition: number, tieSize = 1) {
  return Number.isInteger(startPosition) && startPosition >= 1 && Number.isInteger(tieSize) && tieSize >= 1
    ? startPosition + tieSize
    : null
}

export function calculateMajorRankingFinishPoints(finish: MajorRankingFinish) {
  return majorRankingPointsForTie(finish.position, finish.tieSize)
}

export function accumulateMajorRankingPoints(majors: ReadonlyArray<ReadonlyArray<MajorRankingFinish>>) {
  const totals = new Map<string, number>()
  for (const major of majors) {
    for (const finish of major) {
      const points = calculateMajorRankingFinishPoints(finish)
      if (points === null) continue
      totals.set(finish.playerId, (totals.get(finish.playerId) ?? 0) + points)
    }
  }
  return totals
}

export function formatMajorRankingPoints(points: number | null) {
  if (points === null) return "—"
  return new Intl.NumberFormat("en-US", { useGrouping: false, maximumFractionDigits: 2 }).format(points)
}
