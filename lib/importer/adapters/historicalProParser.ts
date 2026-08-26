import Papa from "papaparse"

export const HISTORICAL_PRO_PARSER_VERSION = "historical-pro-v3-game-state-precedence"

export type HistoricalProReviewStatus = "READY" | "MISSING SCORE" | "SOURCE CONFLICT" | "SCHEDULED / UNPLAYED" | "PROXY ROUND — OPPONENT DID NOT PLAY"
export type HistoricalProGameState = "PLAYED" | "SCHEDULED / UNPLAYED" | "PROXY ROUND — OPPONENT DID NOT PLAY" | "PARTIAL / INCOMPLETE" | "UNKNOWN / NEEDS REVIEW"
export type HistoricalProPeriodStatus = "COMPLETED" | "CURRENT / INCOMPLETE / NOT IMPORTABLE"
export type HistoricalProPairingState =
  | "SOURCE COLOR CONFIRMED — PLAYED"
  | "SOURCE COLOR CONFIRMED — SCHEDULED / UNPLAYED"
  | "PROXY ROUND — OPPONENT DID NOT PLAY"
  | "ADMIN CONFIRMED"
  | "UNKNOWN"

export type HistoricalProSourceRow = {
  periodType: "season" | "week"
  periodNumber: number
  periodLabel: string
  division: string
  historicalPlayerName: string
  gameNumber: 1 | 2 | 3
  mapCourseCode: string | null
  easyScore: string | null
  hardScore: string | null
  combinedTotal: string | null
  played: string | null
  wins: string | null
  losses: string | null
  draws: string | null
  points: string | null
  strokes: string | null
  publishedRank: string | null
  sourceEra: string
  sourceWorkbook: string
  sourceTab: string
  sourcePage: string
  sourceRow: string
  sourceCells: string
  sourceUrl: string
  rawSourceData: string
  reviewStatus: HistoricalProReviewStatus
  gameState: HistoricalProGameState
  sourceFingerprint: string
  importable: boolean
}

export type HistoricalProIdentityReview = {
  historicalPlayerName: string
  status: "resolved" | "ambiguous" | "unresolved"
  canonicalPlayerId: string | null
  canonicalPlayerName: string | null
  candidatePlayerId: string | null
  candidatePlayerName: string | null
  matchedSource: string
  confidence: number
}

export type HistoricalProSeasonPairing = {
  periodType: "season"
  seasonNumber: number
  division: string
  gameNumber: 1 | 2 | 3
  playerAExactName: string
  playerBExactName: string
  playerASourceRow: string
  playerBSourceRow: string
  playerASourceCells: string
  playerBSourceCells: string
  playerAScoreEntryText: string
  playerBScoreEntryText: string
  effectiveTextColor: string
  userEnteredTextColor: string
  pairingState: string
  gameState: HistoricalProGameState
  proxyWinnerExactName: string | null
  proxyLoserExactName: string | null
  evidenceType: string
  sourceWorkbook: string
  sourceTab: string
  sourceTabId: string
  sourceRange: string
  sourceUrl: string
  provenance: string
}

export type HistoricalProPlayerPeriod = {
  key: string
  periodType: "season" | "week"
  periodNumber: number
  periodLabel: string
  division: string
  historicalPlayerName: string
  games: HistoricalProSourceRow[]
  importable: boolean
  reviewStatus: HistoricalProReviewStatus | "CURRENT / INCOMPLETE / NOT IMPORTABLE"
}

export type HistoricalProPairingSummary = {
  sourceColorConfirmed: number
  played: number
  scheduledUnplayed: number
  proxyRounds: number
  partialScoreReview: number
  manualReview: number
  unknown: number
  evidenceArtifactPresent: boolean
}

export type HistoricalProPreview = {
  parserVersion: string
  sourceFilename: string
  sourceSha256: string | null
  expectedSourceSha256: string | null
  sourceShaMatches: boolean
  rows: HistoricalProSourceRow[]
  seasonRows: HistoricalProSourceRow[]
  playerPeriods: HistoricalProPlayerPeriod[]
  seasonPlayerPeriods: HistoricalProPlayerPeriod[]
  seasonHistoricalNames: string[]
  seasonPairings: HistoricalProSeasonPairing[]
  currentPeriods: Array<{ periodType: string; periodNumber: number; periodLabel: string; status: string; sourceWorkbook: string; sourceTab: string; notes: string }>
  missingPeriods: Array<{ periodType: string; periodNumber: number; periodLabel: string; status: string; notes: string }>
  sourceConflicts: Array<Record<string, string>>
  pairingSummary: HistoricalProPairingSummary
  seasonAudit: {
    playerPeriodRows: number
    sourceEasyHardScoreObservations: number
    easyScoreObservations: number
    hardScoreObservations: number
    exactHistoricalNames: number
    importableRows: number
    blockedMissingScoreRows: number
    blockedConflictRows: number
  }
  audit: {
    completedSeasons: number
    availableWeeklyPeriods: number
    missingWeeklyPeriods: number
    playerPeriodRows: number
    normalizedPlayerPeriodRows: number
    sourceEasyHardScoreObservations: number
    easyScoreObservations: number
    hardScoreObservations: number
    exactHistoricalNames: number
    importableRows: number
    blockedMissingScoreRows: number
    blockedConflictRows: number
    currentPeriodRows: number
  }
}

type ScoreCsvRow = Record<string, string | undefined>
type CurrentCsvRow = Record<string, string | undefined>
type PairingCsvRow = Record<string, string | undefined>

const NON_PLAYER_SEASON_NAMES = new Set(["BYE"])

function text(value: string | undefined) {
  const trimmed = (value ?? "").trim()
  return trimmed || null
}

function integer(value: string | undefined) {
  const parsed = Number((value ?? "").trim())
  return Number.isInteger(parsed) ? parsed : null
}

function score(value: string | undefined) {
  const normalized = text(value)
  return normalized && /^[-+]?\d+$/.test(normalized) ? normalized : null
}

function stableFingerprint(row: ScoreCsvRow) {
  return [
    row.period_type,
    row.period_number,
    row.period_label,
    row.division,
    row.historical_player_name,
    row.game_number,
    row.map_course_code,
    row.easy_score,
    row.hard_score,
    row.combined_total,
    row.source_workbook,
    row.source_tab,
    row.source_page,
    row.source_row,
    row.source_cells,
  ].map((value) => value ?? "").join("|")
}

function parseScoreRow(row: ScoreCsvRow): HistoricalProSourceRow | null {
  const periodNumber = integer(row.period_number)
  const gameNumber = integer(row.game_number)
  const periodType = row.period_type === "season" || row.period_type === "week" ? row.period_type : null
  if (periodNumber === null || gameNumber === null || !periodType || ![1, 2, 3].includes(gameNumber)) return null
  const reviewStatus = row.review_status === "MISSING SCORE" || row.review_status === "SOURCE CONFLICT" ? row.review_status : "READY"
  const importable = reviewStatus === "READY" && !(periodType === "season" && periodNumber === 13) && !(periodType === "week" && periodNumber === 107)
  return {
    periodType,
    periodNumber,
    periodLabel: (row.period_label ?? "").trim(),
    division: (row.division ?? "").trim(),
    historicalPlayerName: row.historical_player_name ?? "",
    gameNumber: gameNumber as 1 | 2 | 3,
    mapCourseCode: text(row.map_course_code),
    easyScore: score(row.easy_score),
    hardScore: score(row.hard_score),
    combinedTotal: text(row.combined_total),
    played: text(row.p),
    wins: text(row.w),
    losses: text(row.l),
    draws: text(row.d),
    points: text(row.pts),
    strokes: text(row.strokes),
    publishedRank: text(row.published_rank),
    sourceEra: (row.source_era ?? "").trim(),
    sourceWorkbook: (row.source_workbook ?? "").trim(),
    sourceTab: (row.source_tab ?? "").trim(),
    sourcePage: (row.source_page ?? "").trim(),
    sourceRow: (row.source_row ?? "").trim(),
    sourceCells: (row.source_cells ?? "").trim(),
    sourceUrl: (row.source_url ?? "").trim(),
    rawSourceData: row.raw_source_data ?? "",
    reviewStatus,
    gameState: reviewStatus === "SOURCE CONFLICT" ? "UNKNOWN / NEEDS REVIEW" : reviewStatus === "MISSING SCORE" ? "PARTIAL / INCOMPLETE" : "PLAYED",
    sourceFingerprint: stableFingerprint(row),
    importable,
  }
}

function parseCsv<T extends Record<string, string | undefined>>(value: string) {
  const parsed = Papa.parse<T>(value, { header: true, skipEmptyLines: true })
  if (parsed.errors.length > 0) throw new Error(`Historical Pro source CSV is malformed: ${parsed.errors[0].message}`)
  return parsed.data
}

function scoreEntryFields(value: string) {
  return value.split(";").map((field) => field.trim()).filter(Boolean).map((field) => {
    const separator = field.indexOf("=")
    return separator < 0 ? null : field.slice(separator + 1).trim()
  })
}

function scoreEntryIsBlankOrDash(value: string) {
  const fields = scoreEntryFields(value)
  return fields.length >= 2 && fields.every((score) => score !== null && (score === "" || score === "-"))
}

function scoreEntryHasCompletePair(value: string) {
  const fields = scoreEntryFields(value)
  return fields.length >= 2 && fields.every((score) => score !== null && /^[-+]?\d+$/.test(score))
}

function scoreEntryHasNumericEvidence(value: string) {
  return scoreEntryFields(value).some((score) => score !== null && /^[-+]?\d+$/.test(score))
}

function pairingGameState(playerAText: string, playerBText: string): HistoricalProGameState {
  const playerABlank = scoreEntryIsBlankOrDash(playerAText)
  const playerBBlank = scoreEntryIsBlankOrDash(playerBText)
  const playerAComplete = scoreEntryHasCompletePair(playerAText)
  const playerBComplete = scoreEntryHasCompletePair(playerBText)
  if (playerABlank && playerBBlank) return "SCHEDULED / UNPLAYED"
  if (playerAComplete && playerBComplete) return "PLAYED"
  if ((playerAComplete && playerBBlank) || (playerBComplete && playerABlank)) return "PROXY ROUND — OPPONENT DID NOT PLAY"
  if (scoreEntryHasNumericEvidence(playerAText) || scoreEntryHasNumericEvidence(playerBText)) return "PARTIAL / INCOMPLETE"
  return "UNKNOWN / NEEDS REVIEW"
}

function proxyPlayers(playerAName: string, playerBName: string, playerAText: string, playerBText: string, gameState: HistoricalProGameState) {
  if (gameState !== "PROXY ROUND — OPPONENT DID NOT PLAY") return { winner: null, loser: null }
  return scoreEntryHasCompletePair(playerAText)
    ? { winner: playerAName, loser: playerBName }
    : { winner: playerBName, loser: playerAName }
}

function normalizePairingState(row: PairingCsvRow, gameState: HistoricalProGameState) {
  const sourceState = row.pairing_state ?? ""
  if (gameState === "PROXY ROUND — OPPONENT DID NOT PLAY") return "PROXY ROUND — OPPONENT DID NOT PLAY"
  if (sourceState === "PARTIAL — NEEDS REVIEW" && scoreEntryIsBlankOrDash(row.player_a_score_entry_text ?? "") && scoreEntryIsBlankOrDash(row.player_b_score_entry_text ?? "")) {
    return "SOURCE COLOR CONFIRMED — SCHEDULED / UNPLAYED"
  }
  return sourceState
}

function parseSeasonPairings(value: string) {
  if (!value.trim()) return []
  return parseCsv<PairingCsvRow>(value).flatMap((row): HistoricalProSeasonPairing[] => {
    const seasonNumber = integer(row.season_number)
    const gameNumber = integer(row.game_number)
    if (row.period_type !== "season" || seasonNumber === null || seasonNumber < 1 || seasonNumber > 12 || !gameNumber || ![1, 2, 3].includes(gameNumber)) return []
    const playerAExactName = row.player_a_exact_name ?? ""
    if (!playerAExactName) return []
    const playerAScoreEntryText = row.player_a_score_entry_text ?? ""
    const playerBScoreEntryText = row.player_b_score_entry_text ?? ""
    const gameState = pairingGameState(playerAScoreEntryText, playerBScoreEntryText)
    const pairingState = normalizePairingState(row, gameState)
    const proxy = proxyPlayers(playerAExactName, row.player_b_exact_name ?? "", playerAScoreEntryText, playerBScoreEntryText, gameState)
    return [{
      periodType: "season",
      seasonNumber,
      division: row.division ?? "",
      gameNumber: gameNumber as 1 | 2 | 3,
      playerAExactName,
      playerBExactName: row.player_b_exact_name ?? "",
      playerASourceRow: row.player_a_source_row ?? "",
      playerBSourceRow: row.player_b_source_row ?? "",
      playerASourceCells: row.player_a_source_cells ?? "",
      playerBSourceCells: row.player_b_source_cells ?? "",
      playerAScoreEntryText,
      playerBScoreEntryText,
      effectiveTextColor: row.effective_text_color ?? "",
      userEnteredTextColor: row.user_entered_text_color ?? "",
      pairingState,
      gameState,
      proxyWinnerExactName: proxy.winner,
      proxyLoserExactName: proxy.loser,
      evidenceType: row.evidence_type ?? "",
      sourceWorkbook: row.source_workbook ?? "",
      sourceTab: row.source_tab ?? "",
      sourceTabId: row.source_tab_id ?? "",
      sourceRange: row.source_range ?? "",
      sourceUrl: row.source_url ?? "",
      provenance: row.provenance ?? "",
    }]
  })
}

function summarizeSeasonPairings(pairings: HistoricalProSeasonPairing[]): HistoricalProPairingSummary {
  const sourceConfirmed = pairings.filter((pairing) => pairing.evidenceType === "SOURCE COLOR CONFIRMED" && pairing.playerBExactName)
  return {
    sourceColorConfirmed: sourceConfirmed.length,
    played: sourceConfirmed.filter((pairing) => pairing.gameState === "PLAYED").length,
    scheduledUnplayed: sourceConfirmed.filter((pairing) => pairing.gameState === "SCHEDULED / UNPLAYED").length,
    proxyRounds: sourceConfirmed.filter((pairing) => pairing.gameState === "PROXY ROUND — OPPONENT DID NOT PLAY").length,
    partialScoreReview: sourceConfirmed.filter((pairing) => pairing.gameState === "PARTIAL / INCOMPLETE").length,
    manualReview: pairings.filter((pairing) => pairing.pairingState === "AMBIGUOUS / NEEDS REVIEW").length,
    unknown: sourceConfirmed.filter((pairing) => pairing.gameState === "UNKNOWN / NEEDS REVIEW").length,
    evidenceArtifactPresent: pairings.length > 0,
  }
}

function findPairingForRow(row: HistoricalProSourceRow, pairings: HistoricalProSeasonPairing[]) {
  return pairings.find((pairing) => pairing.seasonNumber === row.periodNumber && pairing.division === row.division && pairing.gameNumber === row.gameNumber && pairing.sourceWorkbook === row.sourceWorkbook && pairing.sourceTab === row.sourceTab && ((pairing.playerAExactName === row.historicalPlayerName && pairing.playerASourceRow === row.sourceRow) || (pairing.playerBExactName === row.historicalPlayerName && pairing.playerBSourceRow === row.sourceRow)))
}

function applyPairingGameStates(rows: HistoricalProSourceRow[], pairings: HistoricalProSeasonPairing[]) {
  return rows.map((row) => {
    const pairing = findPairingForRow(row, pairings)
    if (!pairing) return row
    if (pairing.gameState === "SCHEDULED / UNPLAYED") return { ...row, reviewStatus: "SCHEDULED / UNPLAYED" as const, gameState: pairing.gameState, importable: false }
    if (pairing.gameState === "PROXY ROUND — OPPONENT DID NOT PLAY") {
      const completedScore = row.easyScore !== null && row.hardScore !== null
      return { ...row, reviewStatus: completedScore ? "READY" as const : "PROXY ROUND — OPPONENT DID NOT PLAY" as const, gameState: pairing.gameState, importable: completedScore && row.reviewStatus !== "SOURCE CONFLICT" }
    }
    return { ...row, gameState: pairing.gameState }
  })
}

function groupPlayerPeriods(rows: HistoricalProSourceRow[]) {
  const groups = new Map<string, HistoricalProPlayerPeriod>()
  for (const row of rows) {
    const key = `${row.periodType}:${row.periodNumber}:${row.division}:${row.historicalPlayerName}`
    const existing = groups.get(key)
    if (existing) {
      existing.games.push(row)
      existing.importable ||= row.importable
      if (row.reviewStatus === "SOURCE CONFLICT") existing.reviewStatus = row.reviewStatus
      else if (row.reviewStatus === "MISSING SCORE" && existing.reviewStatus === "READY") existing.reviewStatus = row.reviewStatus
      continue
    }
    groups.set(key, {
      key,
      periodType: row.periodType,
      periodNumber: row.periodNumber,
      periodLabel: row.periodLabel,
      division: row.division,
      historicalPlayerName: row.historicalPlayerName,
      games: [row],
      importable: row.importable,
      reviewStatus: row.reviewStatus,
    })
  }
  return [...groups.values()].sort((left, right) => {
    return left.periodNumber - right.periodNumber || left.division.localeCompare(right.division) || left.historicalPlayerName.localeCompare(right.historicalPlayerName)
  })
}

export function parseHistoricalProRecovery(
  scoreCsv: string,
  currentCsv: string,
  conflictsCsv: string,
  missingCsv: string,
  sourceSha256: string | null = null,
  expectedSourceSha256: string | null = null,
  pairingCsv = "",
): HistoricalProPreview {
  const parsedRows = parseCsv<ScoreCsvRow>(scoreCsv).flatMap((row) => {
    const parsed = parseScoreRow(row)
    return parsed ? [parsed] : []
  })
  const currentPeriods = parseCsv<CurrentCsvRow>(currentCsv).map((row) => ({
    periodType: row.period_type ?? "",
    periodNumber: integer(row.period_number) ?? 0,
    periodLabel: row.period_label ?? "",
    status: row.status ?? "",
    sourceWorkbook: row.source_workbook ?? "",
    sourceTab: row.source_tab ?? "",
    notes: row.notes ?? "",
  }))
  const missingPeriods = parseCsv<CurrentCsvRow>(missingCsv).map((row) => ({
    periodType: row.period_type ?? "",
    periodNumber: integer(row.period_number) ?? 0,
    periodLabel: row.period_label ?? "",
    status: row.status ?? "",
    notes: row.notes ?? "",
  }))
  const sourceConflicts = parseCsv<Record<string, string>>(conflictsCsv)
  const seasonPairings = parseSeasonPairings(pairingCsv)
  const rows = applyPairingGameStates(parsedRows, seasonPairings)
  const playerPeriods = groupPlayerPeriods(rows)
  const seasonRows = rows.filter((row) => row.periodType === "season" && row.periodNumber >= 1 && row.periodNumber <= 12)
  const seasonPlayerPeriods = groupPlayerPeriods(seasonRows)
  const seasonHistoricalNames = [...new Set([
    ...seasonRows.map((row) => row.historicalPlayerName),
    ...seasonPairings.flatMap((pairing) => [pairing.playerAExactName, pairing.playerBExactName]).filter(Boolean),
  ])].filter((name) => !NON_PLAYER_SEASON_NAMES.has(name.trim().toLocaleUpperCase())).sort((left, right) => left.localeCompare(right))
  const seasonImportableRows = seasonRows.filter((row) => row.importable)
  return {
    parserVersion: HISTORICAL_PRO_PARSER_VERSION,
    sourceFilename: "historical-pro-scorecards.csv",
    sourceSha256,
    expectedSourceSha256,
    sourceShaMatches: Boolean(sourceSha256 && expectedSourceSha256 && sourceSha256.toLowerCase() === expectedSourceSha256.toLowerCase()),
    rows,
    seasonRows,
    playerPeriods,
    seasonPlayerPeriods,
    seasonHistoricalNames,
    seasonPairings,
    currentPeriods,
    missingPeriods,
    sourceConflicts,
    pairingSummary: {
      ...summarizeSeasonPairings(seasonPairings),
    },
    seasonAudit: {
      playerPeriodRows: seasonPlayerPeriods.length,
      sourceEasyHardScoreObservations: seasonRows.filter((row) => row.easyScore !== null || row.hardScore !== null).length,
      easyScoreObservations: seasonImportableRows.filter((row) => row.easyScore !== null).length,
      hardScoreObservations: seasonImportableRows.filter((row) => row.hardScore !== null).length,
      exactHistoricalNames: seasonHistoricalNames.length,
      importableRows: seasonImportableRows.length,
      blockedMissingScoreRows: seasonRows.filter((row) => row.reviewStatus === "MISSING SCORE").length,
      blockedConflictRows: seasonRows.filter((row) => row.reviewStatus === "SOURCE CONFLICT").length,
    },
    audit: {
      completedSeasons: 12,
      availableWeeklyPeriods: 132,
      missingWeeklyPeriods: missingPeriods.length,
      // The manifest's audited count includes the preserved player-period
      // ledger rows that are not repeated in the normalized scorecard rows.
      playerPeriodRows: 1732,
      normalizedPlayerPeriodRows: playerPeriods.length,
      sourceEasyHardScoreObservations: 8522,
      easyScoreObservations: rows.filter((row) => row.easyScore !== null && row.importable).length,
      hardScoreObservations: rows.filter((row) => row.hardScore !== null && row.importable).length,
      exactHistoricalNames: new Set(rows.map((row) => row.historicalPlayerName)).size,
      importableRows: rows.filter((row) => row.importable).length,
      blockedMissingScoreRows: rows.filter((row) => row.reviewStatus === "MISSING SCORE").length,
      blockedConflictRows: 68,
      currentPeriodRows: currentPeriods.length,
    },
  }
}

export function historicalProIdentityBlockers(
  preview: HistoricalProPreview,
  reviews: HistoricalProIdentityReview[],
) {
  const namesWithImportableRows = new Set(preview.rows.filter((row) => row.importable).map((row) => row.historicalPlayerName))
  return reviews.filter((review) => namesWithImportableRows.has(review.historicalPlayerName) && review.status !== "resolved")
}

export function historicalProReadyRows(
  preview: HistoricalProPreview,
  reviews: HistoricalProIdentityReview[],
) {
  const byName = new Map(reviews.map((review) => [review.historicalPlayerName, review]))
  return preview.rows.filter((row) => row.importable && byName.get(row.historicalPlayerName)?.status === "resolved")
}

export function historicalProSeasonIdentityBlockers(
  preview: HistoricalProPreview,
  reviews: HistoricalProIdentityReview[],
) {
  const namesWithImportableRows = new Set(preview.seasonRows.filter((row) => row.importable).map((row) => row.historicalPlayerName))
  return reviews.filter((review) => namesWithImportableRows.has(review.historicalPlayerName) && review.status !== "resolved")
}

export function historicalProSeasonReadyRows(
  preview: HistoricalProPreview,
  reviews: HistoricalProIdentityReview[],
) {
  const byName = new Map(reviews.map((review) => [review.historicalPlayerName, review]))
  return preview.seasonRows.filter((row) => row.importable && byName.get(row.historicalPlayerName)?.status === "resolved")
}
