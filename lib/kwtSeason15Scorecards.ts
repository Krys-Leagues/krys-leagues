export const KWT_S15_W01_EVENT = "KWTS15W01"
export const KWT_S15_W01_COURSE = "Raptor Cliffs"

export type KwtGrossDivision = "ELITE" | "PRO" | "SEMI-PRO" | "AMATEUR"

export type KwtSeason15Scorecard = {
  sourceRow: number
  playerName: string
  grossDivision: KwtGrossDivision | null
  easyCode: "RCE"
  hardCode: "RCH"
  easyHoles: number[]
  hardHoles: number[]
  easyScore: number
  hardScore: number
  totalScore: number
  position: number | null
  points: number | null
  badges: string[]
  easyAces: number
  hardAces: number
  combinedAces: number
  identityStatus: "UNRESOLVED"
}

export type KwtSeason15ParseResult = {
  eventIdentifier: string
  courseName: string
  rows: KwtSeason15Scorecard[]
  errors: string[]
  warnings: string[]
  duplicateRows: number
}

type CsvRecord = Record<string, unknown>

const required = ["Pos", "Player", "Rank Code", "Easy Code", "Hard Code", "Easy", "Hard", "Total Score", "Points", "Badges"]
const key = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
const value = (record: Map<string, unknown>, name: string) => String(record.get(key(name)) ?? "").trim()
const integer = (raw: string) => /^-?\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : null
const holeNames = (prefix: "E" | "H") => Array.from({ length: 18 }, (_, index) => `${prefix}${index + 1}`)

function division(raw: string): KwtGrossDivision | null {
  return raw === "ELITE" ? "ELITE" : raw === "PRO" ? "PRO" : raw === "SEMI" || raw === "SEMI-PRO" ? "SEMI-PRO" : raw === "AMA" || raw === "AMATEUR" ? "AMATEUR" : null
}

export function parseKwtSeason15Week01(records: readonly CsvRecord[], fileName: string): KwtSeason15ParseResult {
  const errors: string[] = []
  const warnings: string[] = []
  const rows: KwtSeason15Scorecard[] = []
  const seen = new Map<string, string>()
  let duplicateRows = 0
  const first = records[0] ? new Map(Object.keys(records[0]).map((header) => [key(header), header])) : new Map<string, string>()
  for (const header of required) if (!first.has(key(header))) errors.push(`${fileName}: missing required column ${header}.`)
  for (const [index, source] of records.entries()) {
    const rowNumber = index + 2
    const record = new Map(Object.entries(source).map(([header, raw]) => [key(header), raw]))
    const playerName = value(record, "Player")
    if (!playerName) { errors.push(`${fileName} row ${rowNumber}: Player is required.`); continue }
    const easyCode = value(record, "Easy Code").toUpperCase()
    const hardCode = value(record, "Hard Code").toUpperCase()
    if (easyCode !== "RCE" || hardCode !== "RCH") errors.push(`${fileName} row ${rowNumber}: expected RCE/RCH for verified Raptor Cliffs Week 01.`)
    const easyHoles = holeNames("E").map((name) => integer(value(record, name)))
    const hardHoles = holeNames("H").map((name) => integer(value(record, name)))
    if (easyHoles.some((hole) => hole === null) || hardHoles.some((hole) => hole === null) || easyHoles.some((hole) => hole! < 1) || hardHoles.some((hole) => hole! < 1)) {
      errors.push(`${fileName} row ${rowNumber}: all 18 Easy and Hard hole scores must be positive integers.`)
      continue
    }
    const easyScore = integer(value(record, "Easy")); const hardScore = integer(value(record, "Hard")); const totalScore = integer(value(record, "Total Score"))
    const position = integer(value(record, "Pos")); const points = integer(value(record, "Points")); const badgeValue = value(record, "Badges")
    if (easyScore === null || hardScore === null || totalScore === null || totalScore !== easyScore + hardScore) { errors.push(`${fileName} row ${rowNumber}: Easy + Hard must equal Total Score.`); continue }
    if (position !== null && position < 1) errors.push(`${fileName} row ${rowNumber}: Pos must be positive.`)
    const logicalKey = `${KWT_S15_W01_EVENT}|${playerName.trim().toLocaleLowerCase()}`
    const fingerprint = JSON.stringify([logicalKey, easyScore, hardScore, easyHoles, hardHoles, position, points, badgeValue])
    if (seen.has(logicalKey)) { if (seen.get(logicalKey) === fingerprint) { duplicateRows += 1 } else errors.push(`${fileName} row ${rowNumber}: conflicting duplicate scorecard for ${playerName}.`); continue }
    seen.set(logicalKey, fingerprint)
    rows.push({ sourceRow: rowNumber, playerName, grossDivision: division(value(record, "Rank Code").toUpperCase()), easyCode: "RCE", hardCode: "RCH", easyHoles: easyHoles as number[], hardHoles: hardHoles as number[], easyScore, hardScore, totalScore, position, points, badges: badgeValue ? badgeValue.split(/[|,]/).map((item) => item.trim()).filter(Boolean) : [], easyAces: easyHoles.filter((hole) => hole === 1).length, hardAces: hardHoles.filter((hole) => hole === 1).length, combinedAces: easyHoles.filter((hole) => hole === 1).length + hardHoles.filter((hole) => hole === 1).length, identityStatus: "UNRESOLVED" })
  }
  const normalizedFileName = fileName.toLowerCase().replace(/\.csv$/i, "").replace(/[^a-z0-9]/g, "")
  if (normalizedFileName !== "kwt15w01fulresults") warnings.push(`${fileName}: Season/week is accepted only because this is the explicitly supplied Week 01 review file.`)
  if (records.length && rows.length === 0 && errors.length === 0) errors.push(`${fileName}: no valid scorecards were found.`)
  return { eventIdentifier: KWT_S15_W01_EVENT, courseName: KWT_S15_W01_COURSE, rows, errors, warnings, duplicateRows }
}

export function aceLeaders(rows: readonly KwtSeason15Scorecard[], netDivisions: ReadonlyMap<string, KwtGrossDivision | null>) {
  return (["ELITE", "PRO", "SEMI-PRO", "AMATEUR"] as const).map((group) => {
    const eligible = rows.filter((row) => netDivisions.get(row.playerName) === group)
    const leaders = (field: "easyAces" | "hardAces" | "combinedAces") => {
      const highest = Math.max(0, ...eligible.map((row) => row[field]))
      return { count: highest, players: eligible.filter((row) => row[field] === highest).map((row) => row.playerName) }
    }
    return { division: group, easy: leaders("easyAces"), hard: leaders("hardAces"), combined: leaders("combinedAces") }
  })
}
