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
  error?: string
}

const COURSE_CODE_MAP: Record<string, string> = {
  ZZE: "Zanzibar",
  ZZH: "Zanzibar",

  LLE: "Laser Lair",
  LLH: "Laser Lair",

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

  ALE: "Atlantis",
  ALH: "Atlantis",

  GTE: "Gothic",
  GTH: "Gothic",

  SWE: "Sweetopia",
  SWH: "Sweetopia",

  AME: "Arizona Modern",
  AMH: "Arizona Modern",

  BBE: "Bungalow Beach",
  BBH: "Bungalow Beach",

  ILE: "Ice Lair",
  ILH: "Ice Lair",

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
      const summary = await importFile(file)
      results.push(summary)
      setSummaries([...results])
    }

    setLoading(false)
  }

  async function importFile(file: File): Promise<ImportSummary> {
    const { season, week } = parseSeasonWeek(file.name)

    const baseSummary: ImportSummary = {
      fileName: file.name,
      season,
      week,
      rowsFound: 0,
      roundsInserted: 0,
      careerEventsInserted: 0,
    }

    if (!season || !week) {
      return { ...baseSummary, error: "Could not detect season/week" }
    }

    const text = await file.text()

    const parsed = Papa.parse<CsvRow>(text, {
      header: true,
      skipEmptyLines: true,
    })

    if (parsed.errors.length > 0) {
      return { ...baseSummary, error: parsed.errors[0].message }
    }

    const rows = parsed.data.filter((r) => clean(r.Player))

    const missingCodes = findMissingCourseCodes(rows)

    if (missingCodes.length > 0) {
      return {
        ...baseSummary,
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

    const roundsResult = await supabase
      .from("handicap_rounds")
      .upsert(handicapRounds, { onConflict: "source_key" })

    if (roundsResult.error) {
      return {
        ...baseSummary,
        rowsFound: rows.length,
        error: roundsResult.error.message,
      }
    }

    const careerResult = await supabase
      .from("player_career_events")
      .upsert(careerEvents, { onConflict: "source_key" })

    if (careerResult.error) {
      return {
        ...baseSummary,
        rowsFound: rows.length,
        roundsInserted: handicapRounds.length,
        error: careerResult.error.message,
      }
    }

    return {
      ...baseSummary,
      rowsFound: rows.length,
      roundsInserted: handicapRounds.length,
      careerEventsInserted: careerEvents.length,
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
        onChange={(e) => handleFiles(e.target.files)}
      />

      {loading && <p>Importing...</p>}

      {summaries.map((s) => (
        <div key={s.fileName} style={{ marginTop: 10 }}>
          <strong>{s.fileName}</strong>
          <div>Season: {s.season}</div>
          <div>Week: {s.week}</div>
          <div>Rows: {s.rowsFound}</div>
          <div>Rounds inserted: {s.roundsInserted}</div>
          <div>Career inserted: {s.careerEventsInserted}</div>
          {s.error && <div style={{ color: "red" }}>{s.error}</div>}
          {!s.error && <div style={{ color: "lime" }}>Imported successfully</div>}
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
  const playerName = clean(row.Player)
  const easyCode = clean(row["Easy Code"])
  const hardCode = clean(row["Hard Code"])

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

      score: toInteger(row.Easy),
      total_score: toInteger(row["Total Score"]),

      rank_code: clean(row["Rank Code"]),
      position: clean(row.Pos),
      points: toNumber(row.Points),

      badges: parseBadges(clean(row.Badges)),
      badges_raw: clean(row.Badges),

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

      score: toInteger(row.Hard),
      total_score: toInteger(row["Total Score"]),

      rank_code: clean(row["Rank Code"]),
      position: clean(row.Pos),
      points: toNumber(row.Points),

      badges: parseBadges(clean(row.Badges)),
      badges_raw: clean(row.Badges),

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
  const playerName = clean(row.Player)
  const easyCode = clean(row["Easy Code"])
  const hardCode = clean(row["Hard Code"])

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

    rank_code: clean(row["Rank Code"]),
    position: clean(row.Pos),
    points: toNumber(row.Points),

    easy_course_key: `${easyCourseName}_easy`,
    hard_course_key: `${hardCourseName}_hard`,

    easy_score: toInteger(row.Easy),
    hard_score: toInteger(row.Hard),
    total_score: toInteger(row["Total Score"]),

    badges: parseBadges(clean(row.Badges)),
    badges_raw: clean(row.Badges),

    source_key: `KWT-S${season}-W${week}-R${rowKey}-${playerName}-career`,
  }
}

function findMissingCourseCodes(rows: CsvRow[]) {
  const missing = new Set<string>()

  for (const row of rows) {
    const easyCode = clean(row["Easy Code"])
    const hardCode = clean(row["Hard Code"])

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

function getHoleScores(row: CsvRow, prefix: "E" | "H") {
  const holes: Record<string, number | null> = {}

  for (let i = 1; i <= 18; i++) {
    holes[String(i)] = toInteger(row[`${prefix}${i}`])
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
  const n = Number(clean(value))
  return Number.isFinite(n) ? Math.trunc(n) : null
}

function toNumber(value: unknown) {
  const n = Number(clean(value))
  return Number.isFinite(n) ? n : null
}