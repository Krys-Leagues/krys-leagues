import type { HistoricalPypRow, HistoricalPypSourceState } from "./adapters/historicalPypParser.ts"

export type HistoricalPypIdentityStatus = "resolved" | "ambiguous" | "unresolved"
export type HistoricalPypPreflightIdentityStatus = HistoricalPypIdentityStatus | "unknown"

export type HistoricalPypPreflightSourceRow = HistoricalPypRow & {
  canonicalPlayerId: string | null
  canonicalOpponentPlayerId: string | null
  identityStatus: HistoricalPypIdentityStatus
}

export type HistoricalPypProductionRow = {
  source_fingerprint: string
  season_number: number
  division: string
  game_number: number
  historical_player_name: string
  canonical_player_id: string | null
  course_1_holes_won: number | null
  course_2_holes_won: number | null
  total_holes_won: number | null
  wins: number | null
  losses: number | null
  draws: number | null
  points: number | null
  published_placement: string | null
  source_state: HistoricalPypSourceState
  opponent_historical_player_name: string | null
  opponent_canonical_player_id: string | null
}

export type HistoricalPypPreflightClassification = "EXACT DUPLICATE" | "MISSING FROM PRODUCTION" | "PRODUCTION-ONLY" | "TRUE CONFLICT"

export type HistoricalPypPreflightItem = {
  classification: HistoricalPypPreflightClassification
  seasonNumber: number
  division: string
  sourceState: HistoricalPypSourceState | "UNKNOWN"
  identityStatus: HistoricalPypPreflightIdentityStatus
  sourceFingerprint: string | null
  productionFingerprint: string | null
  source: HistoricalPypPreflightSourceRow | null
  production: HistoricalPypProductionRow | null
  conflictFields: string[]
}

export type HistoricalPypPreflightSummary = {
  classification: HistoricalPypPreflightClassification
  seasonNumber: number
  division: string
  sourceState: HistoricalPypSourceState | "UNKNOWN"
  identityStatus: HistoricalPypPreflightIdentityStatus
  sourceCount: number
  productionCount: number
}

export type HistoricalPypPreflightResult = {
  sourceRowCount: number
  productionRowCount: number
  items: HistoricalPypPreflightItem[]
  summary: HistoricalPypPreflightSummary[]
  conflicts: HistoricalPypPreflightItem[]
}

function normalize(value: string | null | undefined) {
  return (value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function placement(value: string | null | undefined) {
  const digits = (value || "").match(/\d+/)?.[0]
  return digits ? Number(digits) : null
}

function logicalKey(row: Pick<HistoricalPypPreflightSourceRow, "seasonNumber" | "division" | "gameNumber" | "historicalPlayerName" | "canonicalPlayerId"> | HistoricalPypProductionRow) {
  const season = "seasonNumber" in row ? row.seasonNumber : row.season_number
  const division = "seasonNumber" in row ? row.division : row.division
  const game = "seasonNumber" in row ? row.gameNumber : row.game_number
  const canonical = "canonicalPlayerId" in row ? row.canonicalPlayerId : row.canonical_player_id
  const name = "seasonNumber" in row ? row.historicalPlayerName : row.historical_player_name
  return `${season}|${division}|${game}|${canonical || `name:${normalize(name)}`}`
}

function comparableFields(source: HistoricalPypPreflightSourceRow, production: HistoricalPypProductionRow) {
  const fields: Array<[string, unknown, unknown]> = [
    ["source_state", source.sourceState, production.source_state],
    ["course_1_holes_won", source.course1HolesWon, production.course_1_holes_won],
    ["course_2_holes_won", source.course2HolesWon, production.course_2_holes_won],
    ["total_holes_won", source.totalHolesWon, production.total_holes_won],
    ["wins", source.wins, production.wins],
    ["losses", source.losses, production.losses],
    ["draws", source.draws, production.draws],
    ["points", source.points, production.points],
    ["published_placement", placement(source.publishedPlacement), placement(production.published_placement)],
  ]
  if (source.canonicalPlayerId && production.canonical_player_id) {
    fields.push(["canonical_player_id", source.canonicalPlayerId, production.canonical_player_id])
  }
  if (source.canonicalOpponentPlayerId && production.opponent_canonical_player_id) {
    fields.push(["opponent_canonical_player_id", source.canonicalOpponentPlayerId, production.opponent_canonical_player_id])
  } else if (source.opponentHistoricalPlayerName && production.opponent_historical_player_name) {
    fields.push(["opponent_historical_player_name", normalize(source.opponentHistoricalPlayerName), normalize(production.opponent_historical_player_name)])
  }
  return fields.filter(([, left, right]) => left !== right).map(([field]) => field)
}

function addSummary(summary: Map<string, HistoricalPypPreflightSummary>, item: HistoricalPypPreflightItem) {
  const key = [item.classification, item.seasonNumber, item.division, item.sourceState, item.identityStatus].join("|")
  const current = summary.get(key) || {
    classification: item.classification,
    seasonNumber: item.seasonNumber,
    division: item.division,
    sourceState: item.sourceState,
    identityStatus: item.identityStatus,
    sourceCount: 0,
    productionCount: 0,
  }
  if (item.source) current.sourceCount += 1
  if (item.production) current.productionCount += 1
  summary.set(key, current)
}

export function classifyHistoricalPypPreflight(
  sourceRows: HistoricalPypPreflightSourceRow[],
  productionRows: HistoricalPypProductionRow[],
): HistoricalPypPreflightResult {
  const byFingerprint = new Map(productionRows.map((row, index) => [row.source_fingerprint, index]))
  const byLogicalKey = new Map<string, number[]>()
  productionRows.forEach((row, index) => {
    const entries = byLogicalKey.get(logicalKey(row)) || []
    entries.push(index)
    byLogicalKey.set(logicalKey(row), entries)
  })
  const usedProduction = new Set<number>()
  const items: HistoricalPypPreflightItem[] = []

  for (const source of sourceRows) {
    const fingerprintIndex = byFingerprint.get(source.sourceFingerprint)
    const logicalIndexes = byLogicalKey.get(logicalKey(source)) || []
    const productionIndex = fingerprintIndex !== undefined && !usedProduction.has(fingerprintIndex)
      ? fingerprintIndex
      : logicalIndexes.find((index) => !usedProduction.has(index))
    const production = productionIndex === undefined ? null : productionRows[productionIndex]
    if (productionIndex !== undefined) usedProduction.add(productionIndex)
    const conflictFields = production ? comparableFields(source, production) : []
    const classification: HistoricalPypPreflightClassification = !production
      ? "MISSING FROM PRODUCTION"
      : conflictFields.length > 0 ? "TRUE CONFLICT" : "EXACT DUPLICATE"
    const item: HistoricalPypPreflightItem = {
      classification,
      seasonNumber: source.seasonNumber,
      division: source.division,
      sourceState: source.sourceState,
      identityStatus: source.identityStatus,
      sourceFingerprint: source.sourceFingerprint,
      productionFingerprint: production?.source_fingerprint || null,
      source,
      production,
      conflictFields,
    }
    items.push(item)
  }

  productionRows.forEach((production, index) => {
    if (usedProduction.has(index)) return
    const item: HistoricalPypPreflightItem = {
      classification: "PRODUCTION-ONLY",
      seasonNumber: production.season_number,
      division: production.division,
      sourceState: production.source_state,
      identityStatus: production.canonical_player_id ? "resolved" : "unknown",
      sourceFingerprint: null,
      productionFingerprint: production.source_fingerprint,
      source: null,
      production,
      conflictFields: [],
    }
    items.push(item)
  })

  const summary = new Map<string, HistoricalPypPreflightSummary>()
  for (const item of items) addSummary(summary, item)
  return {
    sourceRowCount: sourceRows.length,
    productionRowCount: productionRows.length,
    items,
    summary: [...summary.values()].sort((left, right) => left.seasonNumber - right.seasonNumber || left.division.localeCompare(right.division) || left.classification.localeCompare(right.classification)),
    conflicts: items.filter((item) => item.classification === "TRUE CONFLICT"),
  }
}
