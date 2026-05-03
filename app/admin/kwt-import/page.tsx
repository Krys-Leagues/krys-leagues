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
  // EXISTING
  ZZE: "Zanzibar", ZZH: "Zanzibar",
  QVE: "Quixote Valley", QVH: "Quixote Valley",
  LBE: "Laser Lair", LBH: "Laser Lair",
  ILE: "Ice Lair", ILH: "Ice Lair",
  ATE: "Atlantis", ATH: "Atlantis",
  CBE: "Cherry Blossom", CBH: "Cherry Blossom",
  GBE: "Gardens of Babylon", GBH: "Gardens of Babylon",
  HWE: "Hollywood", HWH: "Hollywood",
  FFE: "Forgotten Fairyland", FFH: "Forgotten Fairyland",
  RCE: "Raptor Cliff", RCH: "Raptor Cliff",
  MWE: "Meow Wolf", MWH: "Meow Wolf",
  VNE: "Venice", VNH: "Venice",
  MYE: "Myst", MYH: "Myst",
  JCE: "Journey to the Center", JCH: "Journey to the Center",

  // 🔥 NEW (FROM YOUR DATA)
  SWE: "Sweetopia", SWH: "Sweetopia",
  OGE: "Mount Olympus", OGH: "Mount Olympus",
  EDE: "El Dorado", EDH: "El Dorado",
  "8BE": "8-Bit Lair", "8BH": "8-Bit Lair",
  WGE: "Widow's Walkabout", WGH: "Widow's Walkabout",
}

export default function KWTImportPage() {
  const [summaries, setSummaries] = useState<ImportSummary[]>([])

  async function handleFiles(files: FileList | null) {
    if (!files) return

    const results: ImportSummary[] = []

    for (const file of Array.from(files)) {
      const res = await importFile(file)
      results.push(res)
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

    const text = await file.text()

    const parsed = Papa.parse<CsvRow>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    })

    const rows = parsed.data.filter((r) => getVal(r, ["Player"]))

    const missing = findMissing(rows)
    if (missing.length) {
      return {
        ...base,
        rowsFound: rows.length,
        error: `Missing course map codes: ${missing.join(", ")}`,
      }
    }

    const rounds = rows.flatMap((r, i) => buildRounds(r, season!, week!, i))
    const careers = rows.map((r, i) => buildCareer(r, season!, week!, i))

    // 🔥 HARD DUPLICATE PROTECTION (FIXED)
    const { error: roundErr } = await supabase
      .from("handicap_rounds")
      .upsert(rounds, { onConflict: "source_key" })

    if (roundErr) return { ...base, error: roundErr.message }

    const { error: careerErr } = await supabase
      .from("player_career_events")
      .upsert(careers, { onConflict: "source_key" })

    if (careerErr) return { ...base, error: careerErr.message }

    return {
      ...base,
      rowsFound: rows.length,
      roundsInserted: rounds.length,
      careerEventsInserted: careers.length,
      duplicatesSkipped: 0,
    }
  }

  return (
    <main style={{ padding: 24, color: "white" }}>
      <h1>KWT CSV Import</h1>
      <input type="file" multiple onChange={(e) => handleFiles(e.target.files)} />

      {summaries.map((s) => (
        <div key={s.fileName} style={{ marginTop: 10 }}>
          <strong>{s.fileName}</strong>
          <div>Season: {s.season}</div>
          <div>Week: {s.week}</div>
          <div>Rows: {s.rowsFound}</div>
          <div>Inserted: {s.roundsInserted}</div>
          <div>Career: {s.careerEventsInserted}</div>
          <div>Duplicates skipped: {s.duplicatesSkipped}</div>
          {s.error && <div style={{ color: "red" }}>{s.error}</div>}
          {!s.error && <div style={{ color: "lime" }}>Done</div>}
        </div>
      ))}
    </main>
  )
}

function buildRounds(r: CsvRow, s: number, w: number, i: number) {
  const name = clean(getVal(r, ["Player"]))
  const e = COURSE_CODE_MAP[clean(getVal(r, ["Easy Code", "EasyCode"]))]
  const h = COURSE_CODE_MAP[clean(getVal(r, ["Hard Code", "HardCode"]))]

  return [
    {
      source_key: `S${s}W${w}-${i}-${name}-${e}`,
      player_name: name,
      course_key: `${e}_easy`,
      difficulty: "easy",
      score: toInt(getVal(r, ["Easy"]))
    },
    {
      source_key: `S${s}W${w}-${i}-${name}-${h}`,
      player_name: name,
      course_key: `${h}_hard`,
      difficulty: "hard",
      score: toInt(getVal(r, ["Hard"]))
    }
  ]
}

function buildCareer(r: CsvRow, s: number, w: number, i: number) {
  return {
    source_key: `S${s}W${w}-${i}-${r.Player}-career`,
    player_name: clean(r.Player),
    total_score: toInt(getVal(r, ["Total Score", "Total"]))
  }
}

function findMissing(rows: CsvRow[]) {
  const set = new Set<string>()
  rows.forEach(r => {
    const e = clean(getVal(r, ["Easy Code", "EasyCode"]))
    const h = clean(getVal(r, ["Hard Code", "HardCode"]))
    if (!COURSE_CODE_MAP[e]) set.add(e)
    if (!COURSE_CODE_MAP[h]) set.add(h)
  })
  return [...set].filter(Boolean)
}

function parseSeasonWeek(name: string) {
  const m = name.toLowerCase().match(/kwt(\d+)w(\d+)/)
  return { season: m ? +m[1] : null, week: m ? +m[2] : null }
}

function getVal(row: CsvRow, keys: string[]) {
  for (const k of keys) {
    if (row[k]) return row[k]
  }
  return ""
}

function clean(v: any) {
  return String(v ?? "").trim().toUpperCase()
}

function toInt(v: any) {
  const n = Number(clean(v))
  return Number.isFinite(n) ? n : null
}