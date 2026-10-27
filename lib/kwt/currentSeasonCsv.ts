import { createHash } from "node:crypto"

import { decodeCsvBytes, parseCsvText, type CsvEncoding } from "../handicap/phase111Reconciliation.ts"

export type CurrentKwtSetup = {
  season: number
  week: number
  eventIdentifier: string
  courseName: string
  easyCourseCode: string
  hardCourseCode: string
}

export type ParsedCurrentKwtRow = {
  sourceRow: number
  sourceFingerprint: string
  rawPlayerName: string
  division: string | null
  easyCourseCode: string
  hardCourseCode: string
  easyScore: number | null
  hardScore: number | null
  totalScore: number | null
  overallPlacement: number | null
  divisionPlacement: number | null
  points: number | null
  badges: string[]
  easyHoles: number[]
  hardHoles: number[]
  rawData: Record<string, string>
  validationErrors: string[]
}

export type CurrentKwtCsvPreview = {
  encoding: CsvEncoding
  rows: ParsedCurrentKwtRow[]
  csvErrors: string[]
  warnings: string[]
  sourceSha256: string
}

function competitionRank(rows: ParsedCurrentKwtRow[], groupBy: (row: ParsedCurrentKwtRow) => string | null) {
  const grouped = new Map<string, ParsedCurrentKwtRow[]>()
  for (const row of rows) {
    if (row.totalScore === null) continue
    const group = groupBy(row)
    if (!group) continue
    const entries = grouped.get(group) ?? []
    entries.push(row)
    grouped.set(group, entries)
  }
  for (const entries of grouped.values()) {
    entries.sort((left, right) => (left.totalScore as number) - (right.totalScore as number) || left.sourceRow - right.sourceRow)
    let previousScore: number | null = null
    let rank = 0
    for (const [index, row] of entries.entries()) {
      if (previousScore === null || row.totalScore !== previousScore) rank = index + 1
      row.divisionPlacement = rank
      previousScore = row.totalScore
    }
  }
}

const key = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
const read = (row: Record<string, string>, name: string) => {
  const wanted = key(name)
  const entry = Object.entries(row).find(([header]) => key(header) === wanted)
  return entry?.[1]?.trim() ?? ""
}
const integer = (value: string) => /^-?\d+$/.test(value) ? Number(value) : null

function division(value: string) {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, " ")
  if (normalized === "ELITE") return "Elite"
  if (normalized === "PRO") return "Pro"
  if (normalized === "SEMI" || normalized === "SEMI-PRO" || normalized === "SEMI PRO") return "Semi Pro"
  if (normalized === "AMA" || normalized === "AMATEUR") return "Amateur"
  return null
}

function fingerprint(setup: CurrentKwtSetup, row: ParsedCurrentKwtRow) {
  return createHash("sha256").update(JSON.stringify({
    event: setup.eventIdentifier,
    sourceRow: row.sourceRow,
    player: row.rawPlayerName,
    easyCode: row.easyCourseCode,
    hardCode: row.hardCourseCode,
    easy: row.easyScore,
    hard: row.hardScore,
    total: row.totalScore,
    easyHoles: row.easyHoles,
    hardHoles: row.hardHoles,
    position: row.overallPlacement,
    divisionPosition: row.divisionPlacement,
    points: row.points,
    badges: row.badges,
  })).digest("hex")
}

export function parseCurrentKwtCsv(bytes: Uint8Array, fileName: string, setup: CurrentKwtSetup): CurrentKwtCsvPreview {
  const decoded = decodeCsvBytes(bytes)
  const parsed = parseCsvText(decoded.text, decoded.encoding)
  const warnings: string[] = []
  const rows: ParsedCurrentKwtRow[] = []
  const seenPlayers = new Map<string, number>()
  const required = ["Player", "Easy Code", "Hard Code", "Easy", "Hard", "Total Score", "Pos", "Points"]
  const headers = parsed.rows[0] ? new Set(Object.keys(parsed.rows[0]).map(key)) : new Set<string>()
  const missing = required.filter((name) => !headers.has(key(name)))
  const holeColumns = [...Array.from({ length: 18 }, (_, index) => `E${index + 1}`), ...Array.from({ length: 18 }, (_, index) => `H${index + 1}`)]
  const missingHoles = holeColumns.filter((name) => !headers.has(key(name)))
  if (missing.length) warnings.push(`Missing required columns: ${missing.join(", ")}.`)
  if (missingHoles.length) warnings.push(`Missing hole-by-hole columns: ${missingHoles.join(", ")}.`)

  for (const [index, rawData] of parsed.rows.entries()) {
    const sourceRow = index + 2
    const rawPlayerName = read(rawData, "Player")
    const easyCourseCode = read(rawData, "Easy Code").toUpperCase()
    const hardCourseCode = read(rawData, "Hard Code").toUpperCase()
    const easyHoles = Array.from({ length: 18 }, (_, hole) => integer(read(rawData, `E${hole + 1}`))).filter((value): value is number => value !== null)
    const hardHoles = Array.from({ length: 18 }, (_, hole) => integer(read(rawData, `H${hole + 1}`))).filter((value): value is number => value !== null)
    const easyScore = integer(read(rawData, "Easy"))
    const hardScore = integer(read(rawData, "Hard"))
    const totalScore = integer(read(rawData, "Total Score"))
    const overallPlacement = integer(read(rawData, "Pos"))
    const suppliedDivisionPlacement = integer(read(rawData, "Division Pos")) ?? integer(read(rawData, "Division Placement"))
    const points = integer(read(rawData, "Points"))
    const errors: string[] = []
    const playerKey = rawPlayerName.normalize("NFKD").replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
    if (!rawPlayerName) errors.push("player: Player is required.")
    if (easyCourseCode !== setup.easyCourseCode || hardCourseCode !== setup.hardCourseCode) errors.push(`course: expected ${setup.easyCourseCode}/${setup.hardCourseCode}.`)
    if (easyHoles.length !== 18 || hardHoles.length !== 18 || easyHoles.some((score) => score < 1) || hardHoles.some((score) => score < 1)) errors.push("scores: all 18 Easy and Hard hole scores must be positive integers.")
    if (easyScore === null || hardScore === null || totalScore === null) errors.push("scores: Easy, Hard, and Total Score are required integers.")
    if (easyScore !== null && hardScore !== null && totalScore !== null && totalScore !== easyScore + hardScore) errors.push("scores: Total Score must equal Easy + Hard.")
    if (overallPlacement === null || overallPlacement < 1) errors.push("placement: Pos must be a positive integer.")
    // The current KWT export supplies Pos (overall gross position), not a
    // separate division-placement column. Division placement is derived below
    // from the verified gross total within the Rank Code division.
    if (points === null) errors.push("points: Points must be an integer.")
    const normalizedDivision = division(read(rawData, "Rank Code"))
    if (!normalizedDivision) errors.push("division: Rank Code must be Elite, Pro, Semi Pro, or Amateur.")
    if (seenPlayers.has(playerKey)) errors.push(`duplicate: player also appears on source row ${seenPlayers.get(playerKey)}.`)
    else if (playerKey) seenPlayers.set(playerKey, sourceRow)
    const row: ParsedCurrentKwtRow = {
      sourceRow,
      sourceFingerprint: "",
      rawPlayerName,
      division: normalizedDivision,
      easyCourseCode,
      hardCourseCode,
      easyScore,
      hardScore,
      totalScore,
      overallPlacement,
      divisionPlacement: suppliedDivisionPlacement,
      points,
      badges: read(rawData, "Badges").split(/[|,]/).map((badge) => badge.trim()).filter(Boolean),
      easyHoles,
      hardHoles,
      rawData,
      validationErrors: errors,
    }
    row.sourceFingerprint = fingerprint(setup, row)
    rows.push(row)
  }
  const hadSuppliedDivisionPlacements = rows.some((row) => row.divisionPlacement !== null)
  competitionRank(rows, (row) => row.division)
  for (const row of rows) {
    row.sourceFingerprint = fingerprint(setup, row)
    if (row.divisionPlacement === null || row.divisionPlacement < 1) {
      row.validationErrors.push("placement: Division Placement could not be derived from a valid gross total and division.")
    }
  }
  if (hadSuppliedDivisionPlacements) {
    warnings.push("Division Placement was supplied by the source for some rows; verified derived gross division ranks were used for the preview.")
  } else if (rows.length) {
    warnings.push("This KWT export has no Division Placement column. Division positions are competition ranks derived from Total Score within each Rank Code division; Pos is retained as the source overall gross position.")
  }
  if (rows.length && rows.every((row) => row.overallPlacement !== null && row.totalScore !== null)) {
    const calculatedOverall = [...rows].sort((left, right) => (left.totalScore as number) - (right.totalScore as number) || left.sourceRow - right.sourceRow)
    let previousScore: number | null = null
    let rank = 0
    for (const [index, row] of calculatedOverall.entries()) {
      if (previousScore === null || row.totalScore !== previousScore) rank = index + 1
      if (row.overallPlacement !== rank) warnings.push(`Source Pos differs from the calculated gross total rank on source row ${row.sourceRow}; the source Pos value is preserved.`)
      previousScore = row.totalScore
    }
    if (!warnings.some((warning) => warning.startsWith("Source Pos differs"))) warnings.push("Pos was verified as the source overall gross competition rank, including ties.")
  }
  if (!rows.length) warnings.push("The CSV contained no data rows.")
  if (missing.length || missingHoles.length) warnings.push("This file can be reviewed, but it cannot be committed until the missing columns are supplied.")
  if (!fileName.toLowerCase().endsWith(".csv")) warnings.push("The uploaded file does not use a .csv extension.")
  return { encoding: decoded.encoding, rows, csvErrors: parsed.errors, warnings, sourceSha256: createHash("sha256").update(bytes).digest("hex") }
}

export function normalizeCurrentKwtIdentity(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
}
