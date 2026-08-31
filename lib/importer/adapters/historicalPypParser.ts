import { createHash } from "node:crypto"

export const HISTORICAL_PYP_PARSER_VERSION = "historical-pyp-review-v2-nonblocking-unknown-opponents"

export type HistoricalPypSourceState = "PLAYED" | "UNPLAYED"
export type HistoricalPypPairingState = "KNOWN" | "AMBIGUOUS" | "UNKNOWN" | "UNUSABLE"

export type HistoricalPypRow = {
  seasonNumber: number
  seasonLabel: string
  sourceEra: "legacy_aggregate" | "detailed_holes_won"
  division: string
  historicalPlayerName: string
  publishedPlacement: string | null
  gameNumber: number
  course1HolesWon: number | null
  course2HolesWon: number | null
  totalHolesWon: number | null
  course1Raw: string
  course2Raw: string
  totalRaw: string
  wins: number | null
  losses: number | null
  draws: number | null
  points: number | null
  sourceState: HistoricalPypSourceState
  sourceStateEvidence: string
  sourceSide: string
  sourceRow: number
  sourceCells: string
  totalCell: string
  wldCells: string
  sourceWorkbook: string
  sourceTab: string
  sourceUrl: string
  sourceRange: string
  sourceFingerprint: string
  pairingState: HistoricalPypPairingState
  opponentHistoricalPlayerName: string | null
  candidateOpponentHistoricalPlayerNames: string[]
  pairingEvidence: string
  pairingSourceRange: string | null
  pairingSourceCells: string | null
  pairingSourceUrl: string | null
  pairingReviewRequired: boolean
  importable: boolean
}

export type HistoricalPypPairingReview = {
  reviewKey: string
  seasonNumber: number
  division: string
  gameNumber: number
  historicalPlayerName: string | null
  opponentHistoricalPlayerName: string | null
  pairingState: "AMBIGUOUS"
  candidateOpponentHistoricalPlayerNames: string[]
  pairingEvidence: string
  sourceRange: string
  sourceCells: string
  sourceUrl: string
  sourceRows: number[]
}

export type HistoricalPypPreview = {
  parserVersion: string
  sourceWorkbook: string
  sourceSpreadsheetId: string
  sourceUrl: string
  historicalSeasons: number[]
  currentExcludedSeasons: number[]
  rows: HistoricalPypRow[]
  pairingReviews: HistoricalPypPairingReview[]
  audit: {
    participantSeasonDivisionRows: number
    playerGameSlots: number
    exactHistoricalNames: number
    playedSlots: number
    unplayedSlots: number
    playedZeroSlots: number
    unplayedZeroZeroSlots: number
    publishedPlacementConflicts: number
    usableOpponentEvidenceRecords: number
    unusableOpponentEvidenceRecords: number
    namedOpponentPairings: number
    unknownOpponentRows: number
    rawPairingReviewItems: number
    unknownNonBlockingPairingRows: number
    duplicateOrMirroredPairingReviews: number
    actionablePairingReviews: number
  }
}

type CsvRow = Record<string, string>

const SOURCE_WORKBOOK = "PYP"
const SOURCE_ID = "1l-FgF1TiEp2oVGihLZlb2SHJTB6mioEcuB6hxGDGbzw"
const SOURCE_URL = `https://docs.google.com/spreadsheets/d/${SOURCE_ID}/edit`

function parseCsv(csv: string): CsvRow[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
    } else if (character === '"') {
      quoted = true
    } else if (character === ",") {
      row.push(field)
      field = ""
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""))
      rows.push(row)
      row = []
      field = ""
    } else {
      field += character
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field.replace(/\r$/, ""))
    rows.push(row)
  }
  const headers = rows.shift() ?? []
  return rows
    .filter((values) => values.some((value) => value.trim() !== ""))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])))
}

function integer(value: string) {
  const trimmed = value.trim()
  if (!trimmed || !/^-?\d+$/.test(trimmed)) return null
  return Number(trimmed)
}

function seasonNumber(value: string) {
  const match = value.trim().match(/\d+/)
  return match ? Number(match[0]) : null
}

function normalizeSeason(value: string) {
  const number = seasonNumber(value)
  return number === null ? value.trim().toUpperCase() : `S${number}`
}

function normalizeDivision(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ")
  const match = trimmed.match(/division\s*(\d+)/i)
  return match ? match[1] : trimmed.toUpperCase()
}

function isUnplayed(row: CsvRow) {
  return row.source_state === "UNPLAYED_BLANK" || row.source_state === "UNPLAYED_DASH"
}

function isZeroZeroReview(row: CsvRow) {
  return row.source_state === "NUMERIC_PAIR" && row.course_1_holes_won === "0" && row.course_2_holes_won === "0" && !row.w && !row.l && !row.d
}

function isNamed(value: string) {
  return Boolean(value.trim()) && !value.includes("#REF!") && !/^\d+$/.test(value.trim())
}

function rowKey(row: Pick<HistoricalPypRow, "seasonNumber" | "division" | "historicalPlayerName" | "gameNumber">) {
  return `${row.seasonNumber}|${row.division}|${row.historicalPlayerName}|${row.gameNumber}`
}

function hash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

export function parseHistoricalPypPackage(normalizedCsv: string, opponentEvidenceCsv: string, rankConflictCsv: string): HistoricalPypPreview {
  const normalizedRows = parseCsv(normalizedCsv)
  const opponentRows = parseCsv(opponentEvidenceCsv)
  const rankRows = parseCsv(rankConflictCsv)
  const rightRanks = new Map(rankRows.map((row) => [`${normalizeSeason(row.season)}|${normalizeDivision(row.division)}|${row.historical_name}`, row.right_placement]))
  const namedEvidence = opponentRows.filter((row) => isNamed(row.player_a_exact) && isNamed(row.player_b_exact))
  const usableEvidence = opponentRows.filter((row) => !row.player_a_exact.includes("#REF!") && !row.player_b_exact.includes("#REF!"))
  const unusableEvidence = opponentRows.filter((row) => row.player_a_exact.includes("#REF!") || row.player_b_exact.includes("#REF!"))
  const evidenceByPlayer = new Map<string, CsvRow[]>()
  for (const evidence of namedEvidence) {
    for (const [name, opponent] of [[evidence.player_a_exact, evidence.player_b_exact], [evidence.player_b_exact, evidence.player_a_exact]]) {
      const key = `${normalizeSeason(evidence.season)}|${normalizeDivision(evidence.division)}|${evidence.game}|${name}`
      const entries = evidenceByPlayer.get(key) ?? []
      entries.push({ ...evidence, matched_opponent: opponent })
      evidenceByPlayer.set(key, entries)
    }
  }
  const unusableByContext = new Map<string, CsvRow[]>()
  for (const evidence of unusableEvidence) {
    const key = `${normalizeSeason(evidence.season)}|${normalizeDivision(evidence.division)}|${evidence.game}`
    unusableByContext.set(key, [...(unusableByContext.get(key) ?? []), evidence])
  }

  const rows: HistoricalPypRow[] = normalizedRows.map((source) => {
    const season = seasonNumber(source.season)
    if (season === null || season < 1 || season > 14) throw new Error(`Historical PYP row has an invalid historical season: ${source.season}`)
    const division = normalizeDivision(source.division)
    const name = source.historical_name
    const gameNumber = Number(source.game)
    const rank = rightRanks.get(`${normalizeSeason(source.season)}|${division}|${name}`) ?? source.published_placement
    const unplayed = isUnplayed(source) || isZeroZeroReview(source)
    const context = `${normalizeSeason(source.season)}|${division}|${gameNumber}`
    const evidence = evidenceByPlayer.get(`${context}|${name}`) ?? []
    const uniqueOpponents = [...new Set(evidence.map((item) => item.matched_opponent))]
    const unusable = unusableByContext.get(context) ?? []
    const pairingState: HistoricalPypPairingState = uniqueOpponents.length === 1
      ? "KNOWN"
      : uniqueOpponents.length > 1
        ? "AMBIGUOUS"
        : unusable.length > 0
          ? "UNUSABLE"
          : "UNKNOWN"
    const pairing = uniqueOpponents.length === 1 ? evidence[0] : null
    const sourceTab = source.season.replace(/^s/i, "S")
    const sourceRange = source.source_cells || source.total_cell
    const sourceFingerprint = hash([
      source.season, division, name, source.game, source.course_1_holes_won, source.course_2_holes_won,
      source.total_holes_won, source.w, source.l, source.d, source.points, source.source_state,
      source.source_side, source.source_row, source.source_cells, source.total_cell, source.wld_cells, source.source_url,
    ].join("\u0000"))
    return {
      seasonNumber: season,
      seasonLabel: `Season ${season}`,
      sourceEra: season <= 2 ? "legacy_aggregate" : "detailed_holes_won",
      division,
      historicalPlayerName: name,
      publishedPlacement: rank || null,
      gameNumber,
      course1HolesWon: integer(source.course_1_holes_won),
      course2HolesWon: integer(source.course_2_holes_won),
      totalHolesWon: integer(source.total_holes_won),
      course1Raw: source.course_1_holes_won,
      course2Raw: source.course_2_holes_won,
      totalRaw: source.total_holes_won,
      wins: integer(source.w),
      losses: integer(source.l),
      draws: integer(source.d),
      points: integer(source.points),
      sourceState: unplayed ? "UNPLAYED" : "PLAYED",
      sourceStateEvidence: isZeroZeroReview(source) ? "SOURCE 0/0 + no game W/L/D evidence — UNPLAYED" : source.source_state,
      sourceSide: source.source_side,
      sourceRow: Number(source.source_row),
      sourceCells: source.score_cells,
      totalCell: source.total_cell,
      wldCells: source.wld_cells,
      sourceWorkbook: SOURCE_WORKBOOK,
      sourceTab,
      sourceUrl: source.source_url,
      sourceRange,
      sourceFingerprint,
      pairingState,
      opponentHistoricalPlayerName: uniqueOpponents.length === 1 ? uniqueOpponents[0] : null,
      candidateOpponentHistoricalPlayerNames: uniqueOpponents,
      pairingEvidence: pairingState === "KNOWN" ? "SOURCE EXPLICIT VS PAIRING" : pairingState === "AMBIGUOUS" ? "MULTIPLE PLAUSIBLE OPPONENTS — NEEDS REVIEW" : pairingState === "UNUSABLE" ? "UNUSABLE #REF! MATCHUP EVIDENCE — NON-BLOCKING" : "UNKNOWN — NO UNIQUE OPPONENT EVIDENCE — NON-BLOCKING",
      pairingSourceRange: pairing?.source_range ?? unusable[0]?.source_range ?? null,
      pairingSourceCells: pairing ? `${pairing.player_a_cell};${pairing.player_b_cell}` : unusable.length ? `${unusable[0].player_a_cell};${unusable[0].player_b_cell}` : null,
      pairingSourceUrl: pairing?.source_url ?? unusable[0]?.source_url ?? null,
      pairingReviewRequired: !unplayed && pairingState === "AMBIGUOUS",
      importable: true,
    }
  })

  const pairingReviews = new Map<string, HistoricalPypPairingReview>()
  const pairingReviewSourceRows = rows.filter((item) => item.pairingReviewRequired)
  for (const row of pairingReviewSourceRows) {
    const context = `${row.seasonNumber}|${row.division}|${row.gameNumber}`
    const evidence = evidenceByPlayer.get(`${context}|${row.historicalPlayerName}`) ?? []
    const unusableEvidence = unusableByContext.get(context) ?? []
    const reviewKey = "pyp-pairing|" + context + "|" + [row.historicalPlayerName, ...row.candidateOpponentHistoricalPlayerNames].sort().join("|")
    if (pairingReviews.has(reviewKey)) continue
    pairingReviews.set(reviewKey, {
      reviewKey,
      seasonNumber: row.seasonNumber,
      division: row.division,
      gameNumber: row.gameNumber,
      historicalPlayerName: row.historicalPlayerName,
      opponentHistoricalPlayerName: null,
      pairingState: "AMBIGUOUS",
      candidateOpponentHistoricalPlayerNames: row.candidateOpponentHistoricalPlayerNames,
      pairingEvidence: evidence.length ? "MULTIPLE PLAUSIBLE OPPONENTS — NEEDS REVIEW" : row.pairingEvidence,
      sourceRange: evidence[0]?.source_range ?? unusableEvidence[0]?.source_range ?? row.sourceRange,
      sourceCells: evidence.length
        ? evidence.flatMap((item) => [item.player_a_cell, item.player_b_cell]).join(";")
        : unusableEvidence.length ? unusableEvidence.flatMap((item) => [item.player_a_cell, item.player_b_cell]).join(";") : row.sourceCells,
      sourceUrl: evidence[0]?.source_url ?? unusableEvidence[0]?.source_url ?? row.sourceUrl,
      sourceRows: evidence.length
        ? evidence.map((item) => Number(item.source_range.match(/(\d+)/)?.[1] ?? 0)).filter(Boolean)
        : unusableEvidence.length ? unusableEvidence.map((item) => Number(item.source_range.match(/(\d+)/)?.[1] ?? 0)).filter(Boolean) : [row.sourceRow],
    })
  }

  const seasons = [...new Set(rows.map((row) => row.seasonNumber))].sort((left, right) => left - right)
  const playedRows = rows.filter((row) => row.sourceState === "PLAYED")
  const unplayedRows = rows.filter((row) => row.sourceState === "UNPLAYED")
  const preview: HistoricalPypPreview = {
    parserVersion: HISTORICAL_PYP_PARSER_VERSION,
    sourceWorkbook: SOURCE_WORKBOOK,
    sourceSpreadsheetId: SOURCE_ID,
    sourceUrl: SOURCE_URL,
    historicalSeasons: seasons,
    currentExcludedSeasons: [15],
    rows,
    pairingReviews: [...pairingReviews.values()],
    audit: {
      participantSeasonDivisionRows: new Set(rows.map((row) => `${row.seasonNumber}|${row.division}|${row.historicalPlayerName}`)).size,
      playerGameSlots: rows.length,
      exactHistoricalNames: new Set(rows.map((row) => row.historicalPlayerName)).size,
      playedSlots: playedRows.length,
      unplayedSlots: unplayedRows.length,
      playedZeroSlots: rows.filter((row) => row.sourceState === "PLAYED" && row.totalHolesWon === 0).length,
      unplayedZeroZeroSlots: rows.filter((row) => row.sourceState === "UNPLAYED" && row.sourceStateEvidence.includes("0/0")).length,
      publishedPlacementConflicts: rankRows.length,
      usableOpponentEvidenceRecords: usableEvidence.length,
      unusableOpponentEvidenceRecords: unusableEvidence.length,
      namedOpponentPairings: namedEvidence.length,
      unknownOpponentRows: rows.filter((row) => row.pairingState === "UNKNOWN").length,
      rawPairingReviewItems: rows.filter((row) => row.sourceState === "PLAYED" && (row.pairingState === "UNUSABLE" || row.pairingState === "UNKNOWN")).length,
      unknownNonBlockingPairingRows: rows.filter((row) => row.pairingState === "UNKNOWN" || row.pairingState === "UNUSABLE").length,
      duplicateOrMirroredPairingReviews: Math.max(0, pairingReviewSourceRows.length - pairingReviews.size),
      actionablePairingReviews: pairingReviews.size,
    },
  }
  return preview
}

export function historicalPypIdentityBlockers(preview: HistoricalPypPreview, decisions: Record<string, string | null>) {
  return [...new Set(preview.rows
    .filter((row) => row.importable && !decisions[row.historicalPlayerName])
    .map((row) => row.historicalPlayerName))]
}

export function historicalPypRowsForReview(preview: HistoricalPypPreview, filters: { season?: number | "all"; division?: string | "all"; needsOnly?: boolean; decisions?: Record<string, string | null>; pairingDecisions?: Record<string, boolean> }) {
  const pairingDecisions = filters.pairingDecisions ?? {}
  return preview.rows.filter((row) => {
    if (filters.season !== undefined && filters.season !== "all" && row.seasonNumber !== filters.season) return false
    if (filters.division !== undefined && filters.division !== "all" && row.division !== filters.division) return false
    if (filters.needsOnly && (!row.pairingReviewRequired || pairingDecisions["pyp-pairing|" + rowKey(row)])) return false
    return true
  })
}

export function historicalPypPairingReviewKey(review: HistoricalPypPairingReview) {
  return review.reviewKey
}

export function historicalPypRowKey(row: HistoricalPypRow) {
  return rowKey(row)
}

export function historicalPypPreviewFingerprint(preview: HistoricalPypPreview) {
  return hash(JSON.stringify({
    parserVersion: preview.parserVersion,
    rows: preview.rows.map((row) => [
      row.sourceFingerprint, row.sourceEra, row.publishedPlacement, row.sourceState, row.sourceStateEvidence,
      row.course1Raw, row.course2Raw, row.totalRaw, row.wins, row.losses, row.draws, row.points,
      row.pairingState, row.opponentHistoricalPlayerName,
    ]),
    pairingReviews: preview.pairingReviews,
  }))
}
