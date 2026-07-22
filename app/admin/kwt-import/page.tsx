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
  ILE: "Ice Lair",
  ILH: "Ice Lair",
  ATE: "Atlantis",
  ATH: "Atlantis",
  CBE: "Cherry Blossom",
  CBH: "Cherry Blossom",
  GBE: "Gardens of Babylon",
  GBH: "Gardens of Babylon",
  HWE: "Hollywood",
  HWH: "Hollywood",
  FFE: "Forgotten Fairyland",
  FFH: "Forgotten Fairyland",
  RCE: "Raptor Cliff",
  RCH: "Raptor Cliff",
  MWE: "Meow Wolf",
  MWH: "Meow Wolf",
  VNE: "Venice",
  VNH: "Venice",
  MYE: "Myst",
  MYH: "Myst",
  JCE: "Journey to the Center",
  JCH: "Journey to the Center",
  SWE: "Sweetopia",
  SWH: "Sweetopia",
  OGE: "Mount Olympus",
  OGH: "Mount Olympus",
  EDE: "El Dorado",
  EDH: "El Dorado",
  "8BE": "8-Bit Lair",
  "8BH": "8-Bit Lair",
  WGE: "Widow's Walkabout",
  WGH: "Widow's Walkabout",
  ELE: "El Dorado",
  ELH: "El Dorado",
  WOE: "Around the World",
  WOH: "Around the World",
  AWE: "Around the World 80 Days",
  AWH: "Around the World 80 Days",
  MOE: "Mars Garden",
  MOH: "Mars Garden",
  TSE: "Tethys Station",
  TSH: "Tethys Station",
  WWE: "Widow's Walkabout",
  WWH: "Widow's Walkabout",
  "20E": "20,000 Leagues",
  "20H": "20,000 Leagues",
  SLE: "Shangri-La",
  SLH: "Shangri-La",
}

export default function KWTImportPage() {
  const [summaries, setSummaries] = useState<ImportSummary[]>([])

  async function handleFiles(files: FileList | null) {
    if (!files) return

    const results: ImportSummary[] = []

    for (const file of Array.from(files)) {
      const result = await importFile(file)

      results.push(result)
      setSummaries([...results])
    }
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

    if (season === null || week === null) {
      return {
        ...base,
        error:
          "The filename must include the KWT season and week, such as kwt59w1.csv.",
      }
    }

    const text = await file.text()

    const parsed = Papa.parse<CsvRow>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    })

    const rows = parsed.data.filter((row) =>
      cleanName(getVal(row, ["Player"]))
    )

    const missing = findMissing(rows)

    if (missing.length > 0) {
      return {
        ...base,
        rowsFound: rows.length,
        error: `Missing course map codes: ${missing.join(", ")}`,
      }
    }

    const rounds = rows.flatMap((row, index) =>
      buildRounds(row, season, week, index)
    )

    const careers = rows.map((row, index) =>
      buildCareer(row, season, week, index)
    )

    const uniqueRounds = Array.from(
      new Map(rounds.map((round) => [round.source_key, round])).values()
    )

    const uniqueCareers = Array.from(
      new Map(careers.map((event) => [event.source_key, event])).values()
    )

    const { error: roundError } = await supabase
      .from("handicap_rounds")
      .upsert(uniqueRounds, {
        onConflict: "source_key",
      })

    if (roundError) {
      return {
        ...base,
        rowsFound: rows.length,
        error: roundError.message,
      }
    }

    const { error: careerError } = await supabase
      .from("player_career_events")
      .upsert(uniqueCareers, {
        onConflict: "source_key",
      })

    if (careerError) {
      return {
        ...base,
        rowsFound: rows.length,
        roundsInserted: uniqueRounds.length,
        error: careerError.message,
      }
    }

    return {
      ...base,
      rowsFound: rows.length,
      roundsInserted: uniqueRounds.length,
      careerEventsInserted: uniqueCareers.length,
      duplicatesSkipped:
        rounds.length -
        uniqueRounds.length +
        (careers.length - uniqueCareers.length),
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        background: "black",
        color: "white",
      }}
    >
      <h1>KWT CSV Import</h1>

      <input
        type="file"
        multiple
        accept=".csv,text/csv"
        onChange={(event) => handleFiles(event.target.files)}
      />

      {summaries.map((summary) => (
        <div
          key={summary.fileName}
          style={{
            marginTop: 16,
            padding: 16,
            background: "#111",
            border: "1px solid #333",
            borderRadius: 10,
          }}
        >
          <strong>{summary.fileName}</strong>
          <div>Season: {summary.season ?? "Not found"}</div>
          <div>Week: {summary.week ?? "Not found"}</div>
          <div>Rows: {summary.rowsFound}</div>
          <div>Rounds inserted: {summary.roundsInserted}</div>
          <div>Career events: {summary.careerEventsInserted}</div>
          <div>Duplicates skipped: {summary.duplicatesSkipped}</div>

          {summary.error ? (
            <div style={{ color: "#ef4444" }}>{summary.error}</div>
          ) : (
            <div style={{ color: "#22c55e" }}>Done</div>
          )}
        </div>
      ))}
    </main>
  )
}

function buildRounds(
  row: CsvRow,
  season: number,
  week: number,
  index: number
) {
  const playerName = cleanName(getVal(row, ["Player"]))
  const easyCode = cleanCode(getVal(row, ["Easy Code", "EasyCode"]))
  const hardCode = cleanCode(getVal(row, ["Hard Code", "HardCode"]))

  const easyCourse = COURSE_CODE_MAP[easyCode]
  const hardCourse = COURSE_CODE_MAP[hardCode]

  return [
    {
      source_key: `S${season}W${week}-${index}-${playerName}-${easyCode}-E`,
      player_name: playerName,
      course_key: `${easyCourse}_easy`,
      difficulty: "easy",
      score: toInt(getVal(row, ["Easy"])),
    },
    {
      source_key: `S${season}W${week}-${index}-${playerName}-${hardCode}-H`,
      player_name: playerName,
      course_key: `${hardCourse}_hard`,
      difficulty: "hard",
      score: toInt(getVal(row, ["Hard"])),
    },
  ]
}

function buildCareer(
  row: CsvRow,
  season: number,
  week: number,
  index: number
) {
  const playerName = cleanName(getVal(row, ["Player"]))

  return {
    source_key: `S${season}W${week}-${index}-${playerName}-career`,
    player_name: playerName,
    total_score: toInt(getVal(row, ["Total Score", "Total"])),
  }
}

function findMissing(rows: CsvRow[]) {
  const missingCodes = new Set<string>()

  rows.forEach((row) => {
    const easyCode = cleanCode(getVal(row, ["Easy Code", "EasyCode"]))
    const hardCode = cleanCode(getVal(row, ["Hard Code", "HardCode"]))

    if (easyCode && !COURSE_CODE_MAP[easyCode]) {
      missingCodes.add(easyCode)
    }

    if (hardCode && !COURSE_CODE_MAP[hardCode]) {
      missingCodes.add(hardCode)
    }
  })

  return [...missingCodes]
}

function parseSeasonWeek(fileName: string) {
  const match = fileName.toLowerCase().match(/kwt(\d+)w(\d+)/)

  return {
    season: match ? Number(match[1]) : null,
    week: match ? Number(match[2]) : null,
  }
}

function getVal(row: CsvRow, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== "") {
      return row[key]
    }
  }

  return ""
}

function cleanName(value: unknown) {
  return String(value ?? "").trim()
}

function cleanCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase()
}

function toInt(value: unknown) {
  const cleanedValue = String(value ?? "").trim()
  const number = Number(cleanedValue)

  return Number.isFinite(number) ? number : null
}