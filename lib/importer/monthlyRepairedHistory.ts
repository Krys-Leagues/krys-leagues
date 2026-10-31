export type MonthlyPlayedState = "PLAYED" | "UNPLAYED"

export type MonthlyRepairMergeStatus =
  | "EXACT_BOTH"
  | "OLD_ONLY"
  | "NEW_ONLY"
  | "BLANK_TO_SCORED_REVIEW"
  | "SCORED_TO_BLANK_REVIEW"
  | "NUMERIC_CONFLICT_REVIEW"
  | "QUARANTINED_REVIEW"

export type MonthlyRepairRow = {
  logicalObservationKey: string
  periodId: number | null
  divisionId: string | null
  division: string
  sourcePlayerId: string | null
  historicalPlayerName: string
  courseName: string
  difficulty: "easy" | "hard"
  score: number | null
  scoreText: string
  playedState: MonthlyPlayedState
  mergeStatus: MonthlyRepairMergeStatus
  repairedSourceFingerprint: string
}

export type MonthlyProductionRow = Pick<MonthlyRepairRow, "logicalObservationKey" | "score" | "playedState">

export function isMonthlyScoreImportable(row: Pick<MonthlyRepairRow, "score" | "playedState">) {
  return row.playedState === "PLAYED" && row.score !== null
}

export type MonthlyProductionOverlap = {
  available: boolean
  exactDuplicateRows: number
  missingFromProductionRows: number
  productionOnlyRows: number
  trueConflictRows: number
  classifications: Array<{
    logicalObservationKey: string
    status: "EXACT DUPLICATE" | "MISSING FROM PRODUCTION" | "PRODUCTION-ONLY" | "TRUE CONFLICT"
  }>
}

export type MonthlyRepairPreflightInput = {
  overlap: MonthlyProductionOverlap
  playedRows: number
  blankUnplayedRows: number
  identityBlockedRows: number
  quarantinedRows: number
  malformedRows: number
  logicalDuplicateRows: number
  requiredIdentityRows: number
}

export function monthlyRepairLogicalKey(row: Pick<MonthlyRepairRow, "periodId" | "divisionId" | "division" | "sourcePlayerId" | "historicalPlayerName" | "courseName" | "difficulty">) {
  const division = row.divisionId || `label:${row.division}`
  const player = row.sourcePlayerId ? `id:${row.sourcePlayerId}` : `name:${row.historicalPlayerName}`
  return `${row.periodId ?? "period-unknown"}|${division}|${player}|${row.courseName}|${row.difficulty}`
}

function sameScore(left: MonthlyProductionRow, right: MonthlyProductionRow) {
  return left.playedState === right.playedState && left.score === right.score
}

export function classifyMonthlyProductionOverlap(
  sourceRows: MonthlyProductionRow[],
  productionRows: MonthlyProductionRow[],
  available = true,
): MonthlyProductionOverlap {
  const importableSourceRows = sourceRows.filter(isMonthlyScoreImportable)
  const importableProductionRows = productionRows.filter(isMonthlyScoreImportable)
  const productionByKey = new Map(importableProductionRows.map(row => [row.logicalObservationKey, row]))
  const sourceKeys = new Set(importableSourceRows.map(row => row.logicalObservationKey))
  const classifications: MonthlyProductionOverlap["classifications"] = []

  for (const source of importableSourceRows) {
    const production = productionByKey.get(source.logicalObservationKey)
    if (!production) {
      classifications.push({ logicalObservationKey: source.logicalObservationKey, status: "MISSING FROM PRODUCTION" })
    } else {
      classifications.push({
        logicalObservationKey: source.logicalObservationKey,
        status: sameScore(source, production) ? "EXACT DUPLICATE" : "TRUE CONFLICT",
      })
    }
  }

  for (const production of importableProductionRows) {
    if (!sourceKeys.has(production.logicalObservationKey)) {
      classifications.push({ logicalObservationKey: production.logicalObservationKey, status: "PRODUCTION-ONLY" })
    }
  }

  return {
    available,
    exactDuplicateRows: classifications.filter(row => row.status === "EXACT DUPLICATE").length,
    missingFromProductionRows: classifications.filter(row => row.status === "MISSING FROM PRODUCTION").length,
    productionOnlyRows: classifications.filter(row => row.status === "PRODUCTION-ONLY").length,
    trueConflictRows: classifications.filter(row => row.status === "TRUE CONFLICT").length,
    classifications,
  }
}

export function monthlyRepairPreflight(input: MonthlyRepairPreflightInput) {
  const blockedReasons: string[] = []
  if (!input.overlap.available) blockedReasons.push("Production overlap unavailable")
  if (input.overlap.trueConflictRows > 0) blockedReasons.push("True Production conflicts remain")
  if (input.identityBlockedRows > 0 || input.requiredIdentityRows > 0) blockedReasons.push("Required player identities are unresolved")
  if (input.malformedRows > 0) blockedReasons.push("Malformed rows remain")
  if (input.logicalDuplicateRows > 0) blockedReasons.push("Logical duplicate rows remain")

  return {
    ready: blockedReasons.length === 0,
    playedRows: input.playedRows,
    blockedReasons,
    blankUnplayedRows: input.blankUnplayedRows,
    identityBlockedRows: input.identityBlockedRows,
    quarantinedRows: input.quarantinedRows,
  }
}

export function summarizeMonthlyIdentityStatuses(statuses: Array<"exact" | "alias" | "ambiguous" | "unresolved">) {
  return {
    exact: statuses.filter(status => status === "exact").length,
    mapped: statuses.filter(status => status === "alias").length,
    ambiguous: statuses.filter(status => status === "ambiguous").length,
    unresolved: statuses.filter(status => status === "unresolved").length,
  }
}
