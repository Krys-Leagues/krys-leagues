export const HISTORICAL_KWT_PARSER_VERSION = "historical-kwt-v1"

export type HistoricalKwtRank = "Amateur" | "Semi-Pro" | "Pro" | "Elite"

export type HistoricalKwtScoreRow = {
  rowKey: string
  sourceRow: number
  season: number
  week: number
  historicalName: string
  rank: HistoricalKwtRank | null
  rawRank: string | null
  easyCode: string
  easyScore: number
  hardCode: string
  hardScore: number
  totalScore: number
  placement: number | null
  points: number | null
  sourcePlayerId: string | null
  easyRoundId: string | null
  hardRoundId: string | null
}

export type HistoricalKwtParseResult = {
  rows: HistoricalKwtScoreRow[]
  errors: string[]
  warnings: string[]
  duplicateRows: number
}

type CsvRow = Record<string, unknown>

const aliases = {
  player: ["player", "playername", "screenname", "displayname", "username"],
  season: ["season", "seasonnumber", "kwtseason"],
  week: ["week", "weeknumber", "round", "kwtweek"],
  rank: ["rank", "division", "rankcode", "historicalrank"],
  easyCode: ["easycode", "easycourse", "courseeasy", "course1", "easycoursecode"],
  easyScore: ["easy", "easyscore", "scoreeasy", "course1score"],
  hardCode: ["hardcode", "hardcourse", "coursehard", "course2", "hardcoursecode"],
  hardScore: ["hard", "hardscore", "scorehard", "course2score"],
  total: ["total", "totalscore", "combined", "combinedscore"],
  placement: ["pos", "position", "placement", "overallplacement"],
  points: ["points", "pts"],
  playerId: ["playerid", "kwtplayerid", "sourceplayerid"],
  easyRoundId: ["easyroundid", "roundideasy", "course1roundid"],
  hardRoundId: ["hardroundid", "roundidhard", "course2roundid"],
} as const

// These are the source codes supported by the legacy KWT importer. Unknown
// codes are blocked so a typo cannot become an untraceable course reference.
export const HISTORICAL_KWT_COURSE_CODES = new Set([
  "ZZE", "ZZH", "QVE", "QVH", "LBE", "LBH", "ILE", "ILH", "ATE", "ATH",
  "CBE", "CBH", "GBE", "GBH", "HWE", "HWH", "FFE", "FFH", "RCE", "RCH",
  "MWE", "MWH", "VNE", "VNH", "MYE", "MYH", "JCE", "JCH", "SWE", "SWH",
  "OGE", "OGH", "EDE", "EDH", "8BE", "8BH", "WGE", "WGH", "ELE", "ELH",
  "WOE", "WOH", "AWE", "AWH", "MOE", "MOH", "TSE", "TSH", "WWE", "WWH",
  "20E", "20H", "SLE", "SLH",
])

function headerKey(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]/g, "")
}

function normalizedRow(row: CsvRow) {
  return new Map(Object.entries(row).map(([key, value]) => [headerKey(key), value]))
}

function value(row: Map<string, unknown>, names: readonly string[]) {
  for (const name of names) {
    const candidate = row.get(name)
    if (candidate !== undefined && String(candidate).trim() !== "") return String(candidate).trim()
  }
  return ""
}

function integer(raw: string) {
  if (!/^-?\d+$/.test(raw.trim())) return null
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) && parsed >= -2147483648 && parsed <= 2147483647 ? parsed : null
}

function positiveInteger(raw: string) {
  const parsed = integer(raw)
  return parsed !== null && parsed > 0 ? parsed : null
}

function requiredPositiveInteger(raw: string, fallback: number | null) {
  return raw === "" ? fallback : positiveInteger(raw)
}

export function normalizeHistoricalKwtRank(raw: string): HistoricalKwtRank | null {
  const key = headerKey(raw)
  if (key === "elite" || key === "e") return "Elite"
  if (key === "pro" || key === "p") return "Pro"
  if (key === "semipro" || key === "semi" || key === "sp") return "Semi-Pro"
  if (key === "amateur" || key === "am" || key === "a") return "Amateur"
  return null
}

export function seasonWeekFromFilename(fileName: string) {
  const compact = fileName.toLocaleLowerCase().replace(/[^a-z0-9]/g, "")
  const match = compact.match(/(?:kwt)?(?:season)?(\d+)(?:week|w)(\d+)/)
  return { season: match ? Number(match[1]) : null, week: match ? Number(match[2]) : null }
}

export function historicalKwtNameKey(name: string) {
  return name.trim().toLocaleLowerCase()
}

export function parseHistoricalKwtRows(records: CsvRow[], fileName: string): HistoricalKwtParseResult {
  const inferred = seasonWeekFromFilename(fileName)
  const rows: HistoricalKwtScoreRow[] = []
  const errors: string[] = []
  const warnings: string[] = []
  const logicalRows = new Map<string, HistoricalKwtScoreRow>()
  let duplicateRows = 0

  records.forEach((source, index) => {
    const sourceRow = index + 2
    const row = normalizedRow(source)
    const historicalName = value(row, aliases.player)
    if (!historicalName) return

    const season = requiredPositiveInteger(value(row, aliases.season), inferred.season)
    const week = requiredPositiveInteger(value(row, aliases.week), inferred.week)
    const easyCode = value(row, aliases.easyCode).toUpperCase()
    const hardCode = value(row, aliases.hardCode).toUpperCase()
    const easyScore = integer(value(row, aliases.easyScore))
    const hardScore = integer(value(row, aliases.hardScore))
    const totalRaw = value(row, aliases.total)
    const suppliedTotal = integer(totalRaw)
    const rawRank = value(row, aliases.rank) || null
    const rank = normalizeHistoricalKwtRank(rawRank ?? "")
    const placementRaw = value(row, aliases.placement)
    const placement = positiveInteger(placementRaw)
    const pointsRaw = value(row, aliases.points)
    const points = integer(pointsRaw)

    if (!season || !week) {
      errors.push(`${fileName} row ${sourceRow}: season and week must be positive integers in the row or filename.`)
      return
    }
    if (!easyCode || !hardCode || easyScore === null || hardScore === null) {
      errors.push(`${fileName} row ${sourceRow}: Player, Easy/Hard course codes, and integer Easy/Hard scores are required.`)
      return
    }
    const unknownCodes = [easyCode, hardCode].filter((code) => !HISTORICAL_KWT_COURSE_CODES.has(code))
    if (unknownCodes.length > 0) {
      errors.push(`${fileName} row ${sourceRow}: unsupported KWT course code(s): ${Array.from(new Set(unknownCodes)).join(", ")}.`)
      return
    }

    if (totalRaw && suppliedTotal === null) {
      errors.push(`${fileName} row ${sourceRow}: supplied total must be an integer.`)
      return
    }
    if (placementRaw && placement === null) {
      errors.push(`${fileName} row ${sourceRow}: supplied placement must be a positive integer.`)
      return
    }
    if (pointsRaw && points === null) {
      errors.push(`${fileName} row ${sourceRow}: supplied points must be an integer.`)
      return
    }

    const totalScore = easyScore + hardScore
    if (suppliedTotal !== null && suppliedTotal !== totalScore) {
      errors.push(`${fileName} row ${sourceRow}: total ${suppliedTotal} does not equal Easy ${easyScore} + Hard ${hardScore}.`)
      return
    }
    if (rawRank && !rank) warnings.push(`${fileName} row ${sourceRow}: rank “${rawRank}” is preserved as unknown.`)

    const logicalKey = [season, week, historicalKwtNameKey(historicalName), easyCode, hardCode].join("|")
    const rowKey = [logicalKey, easyScore, hardScore, rawRank ?? "", placement ?? "", points ?? "", value(row, aliases.playerId), value(row, aliases.easyRoundId), value(row, aliases.hardRoundId)].join("|")
    const prior = logicalRows.get(logicalKey)
    if (prior) {
      if (prior.rowKey === rowKey) duplicateRows += 1
      else errors.push(`${fileName} rows ${prior.sourceRow} and ${sourceRow}: conflicting duplicate KWT score rows for ${historicalName} in season ${season}, week ${week}.`)
      return
    }

    const parsed: HistoricalKwtScoreRow = {
      rowKey,
      sourceRow,
      season,
      week,
      historicalName,
      rank,
      rawRank,
      easyCode,
      easyScore,
      hardCode,
      hardScore,
      totalScore,
      placement,
      points,
      sourcePlayerId: value(row, aliases.playerId) || null,
      easyRoundId: value(row, aliases.easyRoundId) || null,
      hardRoundId: value(row, aliases.hardRoundId) || null,
    }
    logicalRows.set(logicalKey, parsed)
    rows.push(parsed)
  })

  if (rows.length === 0 && errors.length === 0) errors.push(`${fileName}: no KWT score rows were found.`)
  return { rows, errors, warnings: Array.from(new Set(warnings)), duplicateRows }
}
