"use client"

import { useState } from "react"
import Papa from "papaparse"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type CsvRow = Record<string, string>

type ImportSummary = {
  fileName: string
  season: number | null
  week: number | null
  rowsFound: number
  roundsInserted: number
  careerEventsInserted: number
  duplicatesSkipped: number
  error?: string
}

const COURSE_CODE_MAP: Record<string, string> = {
  ZZE: "Zanzibar",
  ZZH: "Zanzibar",

  QVE: "Quixote Valley",
  QVH: "Quixote Valley",

  LBE: "Laser Lair",
  LBH: "Laser Lair",
  LLE: "Laser Lair",
  LLH: "Laser Lair",

  ILE: "Ice Lair",
  ILH: "Ice Lair",

  ATE: "Atlantis",
  ATH: "Atlantis",
  ALE: "Atlantis",
  ALH: "Atlantis",

  TTE: "Tourist Trap",
  TTH: "Tourist Trap",

  CBE: "Cherry Blossom",
  CBH: "Cherry Blossom",

  SSE: "Seagull Stacks",
  SSH: "Seagull Stacks",

  GBE: "Gardens of Babylon",
  GBH: "Gardens of Babylon",

  TZE: "Temple at Zerzura",
  TZH: "Temple at Zerzura",

  SLE: "Shangri-La",
  SLH: "Shangri-La",

  GTE: "Gothic",
  GTH: "Gothic",

  SWE: "Sweetopia",
  SWH: "Sweetopia",

  AME: "Arizona Modern",
  AMH: "Arizona Modern",

  BBE: "Bungalow Beach",
  BBH: "Bungalow Beach",

  AFE: "Alfheim",
  AFH: "Alfheim",

  EDE: "El Dorado",
  EDH: "El Dorado",

  MWE: "Meow Wolf",
  MWH: "Meow Wolf",

  RCE: "Raptor Cliff",
  RCH: "Raptor Cliff",

  FFE: "Forgotten Fairyland",
  FFH: "Forgotten Fairyland",

  HWE: "Hollywood",
  HWH: "Hollywood",
}

export default function KWTImportPage() {
  const [summaries, setSummaries] = useState<ImportSummary[]>([])
  const [loading, setLoading] = useState(false)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return

    setLoading(true)
    setSummaries([])

    const results: ImportSummary[] = []

    for (const file of Array.from(files)) {
      const result = await importFile(file)
      results.push(result)
      setSummaries([...results])
    }

    setLoading(false)
  }

  async function importFile(file: File): Promise<ImportSummary> {
    const { season, week } = parseSeasonWeek(file.name)

    const base: ImportSummary = {
      fileName: file.name,
      season,
      week,
      rowsFound: 0,
      roundsInserted: 0,
      careerEventsInserted: 0,
      duplicatesSkipped: 0,
    }

    if (!season || !week) {
      return { ...base, error: "Could not detect season/week from file name." }
    }

    const text = await file.text()

    const parsed = Papa.parse<CsvRow>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    })

    if (parsed.errors.length > 0) {
      return { ...base, error: parsed.errors[0].message }
    }

    const rows = parsed.data.filter((row) => getPlayerName(row))

    const missingCodes = findMissingCourseCodes(rows)

    if (missingCodes.length > 0) {
      return {
        ...base,
        rowsFound: rows.length,
        error: `Missing course map codes: ${missingCodes.join(", ")}`,
      }
    }

    const handicapRounds = rows.flatMap((row, index) =>
      buildHandicapRounds(row, season, week, index)
    )

    const careerEvents = rows.map((row, index) =>
      buildCareerEvent(row, season, week, index)
    )

    const sourceKeys = handicapRounds.map((round) => round.source_key)

    const { data: existingRounds, error: existingError } = await supabase
      .from("handicap_rounds")
      .select("source_key")
      .in("source_key", sourceKeys)

    if (existingError) {
      return { ...base, rowsFound: rows.length, error: existingError.message }
    }

    const existingSet = new Set(existingRounds?.map((row) => row.source_key))
    const newRounds = handicapRounds.filter((round) => !existingSet.has(round.source_key))
    const duplicatesSkipped = handicapRounds.length - newRounds.length

    if (newRounds.length > 0) {
      const { error: roundsError } = await supabase
        .from("handicap_rounds")
        .insert(newRounds)

      if (roundsError) {
        return { ...base, rowsFound: rows.length, error: roundsError.message }
      }
    }

    const { error: careerError } = await supabase
      .from("player_career_events")
      .upsert(careerEvents, { onConflict: "source_key" })

    if (careerError) {
      return {
        ...base,
        rowsFound: rows.length,
        roundsInserted: newRounds.length,
        duplicatesSkipped,
        error: careerError.message,
      }
    }

    return {
      ...base,
      rowsFound: rows.length,
      roundsInserted: newRounds.length,
      careerEventsInserted: careerEvents.length,
      duplicatesSkipped,
    }
  }

  return (
    <main style={{ padding: "24px", color: "white" }}>
      <h1 style={{ fontSize: "32px", marginBottom: "8px" }}>
        KWT CSV Import
      </h1>

      <input
        type="file"
        accept=".csv"
        multiple
        disabled={loading}
        onChange={(event) => handleFiles(event.target.files)}
      />

      {loading && <p>Importing...</p>}

      {summaries.map((summary) => (
        <div key={summary.fileName} style={{ marginTop: 16 }}>
          <strong>{summary.fileName}</strong>
          <div>Season: {summary.season}</div>
          <div>Week: {summary.week}</div>
          <div>Rows: {summary.rowsFound}</div>
          <div>Rounds inserted: {summary.roundsInserted}</div>
          <div>Career inserted: {summary.careerEventsInserted}</div>
          <div>Duplicates skipped: {summary.duplicatesSkipped}</div>

          {summary.error && (
            <div style={{ color: "red" }}>{summary.error}</div>
          )}

          {!summary.error && (
            <div style={{ color: "lime" }}>Imported successfully</div>
          )}
        </div>
      ))}
    </main>
  )
}

function buildHandicapRounds(
  row: CsvRow,
  season: number,
  week: number,
  rowIndex: number
) {
  const playerName = getPlayerName(row)
  const easyCode = getEasyCode(row)
  const hardCode = getHardCode(row)

  const easyCourseName = COURSE_CODE_MAP[easyCode]
  const hardCourseName = COURSE_CODE_MAP[hardCode]

  const rowKey = String(rowIndex + 1).padStart(3, "0")

  return [
    {
      source: "KWT",
      source_season: season,
      source_week: week,
      source_event: `KWT S${season} W${week}`,

      player_name: playerName,
      player_id: null,

      course_key: `${easyCourseName}_easy`,
      course_name: easyCourseName,
      difficulty: "easy",

      score: toInteger(getValue(row, ["Easy", "E Score", "Easy Score"])),
      total_score: toInteger(getValue(row, ["Total Score", "Total", "TOTAL"])),

      rank_code: getValue(row, ["Rank Code", "Rank", "RankCode"]),
      position: getValue(row, ["Pos", "Position"]),
      points: toNumber(getValue(row, ["Points", "Pts"])),

      badges: parseBadges(getValue(row, ["Badges", "Badge"])),
      badges_raw: getValue(row, ["Badges", "Badge"]),

      hole_scores: getHoleScores(row, "E"),

      source_key: `KWT-S${season}-W${week}-R${rowKey}-${playerName}-${easyCourseName}_easy`,
    },
    {
      source: "KWT",
      source_season: season,
      source_week: week,
      source_event: `KWT S${season} W${week}`,

      player_name: playerName,
      player_id: null,

      course_key: `${hardCourseName}_hard`,
      course_name: hardCourseName,
      difficulty: "hard",

      score: toInteger(getValue(row, ["Hard", "H Score", "Hard Score"])),
      total_score: toInteger(getValue(row, ["Total Score", "Total", "TOTAL"])),

      rank_code: getValue(row, ["Rank Code", "Rank", "RankCode"]),
      position: getValue(row, ["Pos", "Position"]),
      points: toNumber(getValue(row, ["Points", "Pts"])),

      badges: parseBadges(getValue(row, ["Badges", "Badge"])),
      badges_raw: getValue(row, ["Badges", "Badge"]),

      hole_scores: getHoleScores(row, "H"),

      source_key: `KWT-S${season}-W${week}-R${rowKey}-${playerName}-${hardCourseName}_hard`,
    },
  ]
}

function buildCareerEvent(
  row: CsvRow,
  season: number,
  week: number,
  rowIndex: number
) {
  const playerName = getPlayerName(row)
  const easyCode = getEasyCode(row)
  const hardCode = getHardCode(row)

  const easyCourseName = COURSE_CODE_MAP[easyCode]
  const hardCourseName = COURSE_CODE_MAP[hardCode]

  const rowKey = String(rowIndex + 1).padStart(3, "0")

  return {
    source: "KWT",
    source_season: season,
    source_week: week,
    source_event: `KWT S${season} W${week}`,

    player_name: playerName,
    player_id: null,

    rank_code: getValue(row, ["Rank Code", "Rank", "RankCode"]),
    position: getValue(row, ["Pos", "Position"]),
    points: toNumber(getValue(row, ["Points", "Pts"])),

    easy_course_key: `${easyCourseName}_easy`,
    hard_course_key: `${hardCourseName}_hard`,

    easy_score: toInteger(getValue(row, ["Easy", "E Score", "Easy Score"])),
    hard_score: toInteger(getValue(row, ["Hard", "H Score", "Hard Score"])),
    total_score: toInteger(getValue(row, ["Total Score", "Total", "TOTAL"])),

    badges: parseBadges(getValue(row, ["Badges", "Badge"])),
    badges_raw: getValue(row, ["Badges", "Badge"]),

    source_key: `KWT-S${season}-W${week}-R${rowKey}-${playerName}-career`,
  }
}

function findMissingCourseCodes(rows: CsvRow[]) {
  const missing = new Set<string>()

  for (const row of rows) {
    const easyCode = getEasyCode(row)
    const hardCode = getHardCode(row)

    if (easyCode && !COURSE_CODE_MAP[easyCode]) missing.add(easyCode)
    if (hardCode && !COURSE_CODE_MAP[hardCode]) missing.add(hardCode)
  }

  return Array.from(missing).sort()
}

function parseSeasonWeek(fileName: string) {
  const match = fileName.toLowerCase().match(/kwt(\d+)w(\d+)/)

  return {
    season: match ? Number(match[1]) : null,
    week: match ? Number(match[2]) : null,
  }
}

function getPlayerName(row: CsvRow) {
  return getValue(row, ["Player", "PLAYER", "player", "Name", "NAME"])
}

function getEasyCode(row: CsvRow) {
  return getValue(row, ["Easy Code", "EasyCode", "Easy Course", "EasyCourse", "E Code", "ECode"])
}

function getHardCode(row: CsvRow) {
  return getValue(row, ["Hard Code", "HardCode", "Hard Course", "HardCourse", "H Code", "HCode"])
}

function getValue(row: CsvRow, keys: string[]) {
  for (const key of keys) {
    const exact = row[key]
    if (clean(exact)) return clean(exact)

    const foundKey = Object.keys(row).find(
      (rowKey) => rowKey.trim().toLowerCase() === key.trim().toLowerCase()
    )

    if (foundKey && clean(row[foundKey])) return clean(row[foundKey])
  }

  return ""
}

function getHoleScores(row: CsvRow, prefix: "E" | "H") {
  const holes: Record<string, number | null> = {}

  for (let i = 1; i <= 18; i++) {
    holes[String(i)] = toInteger(getValue(row, [`${prefix}${i}`, `${prefix} ${i}`]))
  }

  return holes
}

function parseBadges(raw: string) {
  if (!raw) return []

  return raw
    .split(/[,|;/]+/)
    .map((badge) => badge.trim())
    .filter(Boolean)
}

function clean(value: unknown) {
  return String(value ?? "").trim()
}

function toInteger(value: unknown) {
  const cleaned = clean(value)
  if (!cleaned) return null

  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

function toNumber(value: unknown) {
  const cleaned = clean(value)
  if (!cleaned) return null

  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}