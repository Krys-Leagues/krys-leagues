"use client"

import Link from "next/link"
import HistoricalMatchPreview from "./components/HistoricalMatchPreview"
import CommittedHistoricalMatchIdentities from "./components/CommittedHistoricalMatchIdentities"
import { previewHistoricalMatchCsv } from "@/lib/importer/adapters/matchAdapter"
import { loadPlayers } from "@/lib/importer/loadPlayers"
import { loadPlayerAliases } from "@/lib/importer/loadPlayerAliases"
import { matchPlayers, type PlayerMatch } from "@/lib/importer/matchPlayers"
import { previewFingerprint, sourceSha256 } from "@/lib/importer/historicalMatchCommit"
import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useMemo,
  useState,
} from "react"

type CsvRow = Record<string, string>

type DetectedColumn = {
  purpose: string
  column: string | null
  confidence: number
}

type ImportType =
  | "stroke"
  | "match"
  | "pyp"
  | "doubles"
  | "monthly"
  | "kwt"
  | "tournament"
  | "course_records"
  | "other"

type ImportTypeOption = {
  value: ImportType
  label: string
  description: string
  icon: string
  expectedColumns: string[]
}

const IMPORT_TYPES: ImportTypeOption[] = [
  {
    value: "stroke",
    label: "Stroke League",
    description:
      "Season stroke scores, divisions, points, courses, and placements.",
    icon: "⛳",
    expectedColumns: [
      "Player",
      "Division",
      "Season",
      "Week or Game",
      "Course",
      "Strokes",
      "Points",
    ],
  },
  {
    value: "match",
    label: "Match Play",
    description:
      "Match results, holes won, points, opponents, and divisions.",
    icon: "🏌️",
    expectedColumns: [
      "Player",
      "Opponent",
      "Division",
      "Season",
      "Result",
      "Holes Won",
      "Points",
    ],
  },
  {
    value: "pyp",
    label: "Pick Your Poison",
    description:
      "PYP match results, divisions, selected courses, and points.",
    icon: "🌶️",
    expectedColumns: [
      "Player",
      "Opponent",
      "Division",
      "Season",
      "Course",
      "Result",
      "Points",
    ],
  },
  {
    value: "doubles",
    label: "Doubles",
    description:
      "Teams, players, divisions, scores, results, and season points.",
    icon: "👥",
    expectedColumns: [
      "Team",
      "Player 1",
      "Player 2",
      "Division",
      "Season",
      "Score or Result",
      "Points",
    ],
  },
  {
    value: "monthly",
    label: "Monthly Ladder",
    description:
      "Monthly divisions, rankings, points, promotions, and relegations.",
    icon: "🪜",
    expectedColumns: [
      "Player",
      "Month",
      "Division",
      "Points",
      "Rank",
      "Promotion Status",
    ],
  },
  {
    value: "kwt",
    label: "KWT",
    description:
      "Krys Weekend Tourney easy, hard, combined, and division results.",
    icon: "🏆",
    expectedColumns: [
      "Player",
      "Season",
      "Week",
      "Division",
      "Easy Course",
      "Easy Score",
      "Hard Course",
      "Hard Score",
      "Combined",
      "Placement",
    ],
  },
  {
    value: "tournament",
    label: "Tournament",
    description:
      "Bracket entries, rounds, opponents, results, and placements.",
    icon: "🥇",
    expectedColumns: [
      "Player",
      "Tournament",
      "Round",
      "Opponent",
      "Result",
      "Placement",
    ],
  },
  {
    value: "course_records",
    label: "Course Records",
    description:
      "Individual course scores, combined records, dates, and record holders.",
    icon: "📊",
    expectedColumns: [
      "Player",
      "Course",
      "Difficulty",
      "Score",
      "Date",
      "Record Type",
    ],
  },
  {
    value: "other",
    label: "Other",
    description:
      "Use manual column mapping for a file that does not match another type.",
    icon: "📁",
    expectedColumns: [],
  },
]

const COLUMN_PATTERNS = {
  player: [
    "player",
    "player name",
    "name",
    "screen name",
    "screen_name",
    "walkabout name",
    "walkabout_name",
    "username",
  ],
  opponent: [
    "opponent",
    "versus",
    "vs",
  ],
  team: [
    "team",
    "team name",
    "team_name",
  ],
  division: [
    "division",
    "div",
    "tier",
    "group",
    "flight",
    "bracket",
  ],
  season: [
    "season",
    "season number",
    "season_number",
  ],
  week: [
    "week",
    "week number",
    "week_number",
    "game",
    "round number",
  ],
  score: [
    "score",
    "total score",
    "total_score",
    "strokes",
    "stroke total",
    "stroke_total",
    "combined",
  ],
  easy_score: [
    "easy score",
    "easy_score",
    "easy",
  ],
  hard_score: [
    "hard score",
    "hard_score",
    "hard",
  ],
  holes_won: [
    "holes won",
    "holes_won",
    "hw",
  ],
  result: [
    "result",
    "winner",
    "win loss",
    "outcome",
  ],
  points: [
    "points",
    "pts",
    "season points",
    "season_points",
  ],
  placement: [
    "placement",
    "place",
    "position",
    "rank",
    "finish",
  ],
  course: [
    "course",
    "course name",
    "course_name",
    "map",
  ],
  date: [
    "date",
    "played date",
    "played_date",
    "match date",
    "match_date",
  ],
  month: [
    "month",
    "ladder month",
    "ladder_month",
  ],
  round: [
    "round",
    "tournament round",
    "tournament_round",
  ],
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []

  let currentRow: string[] = []
  let currentValue = ""
  let insideQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const nextCharacter = text[index + 1]

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        currentValue += '"'
        index += 1
      } else {
        insideQuotes = !insideQuotes
      }

      continue
    }

    if (character === "," && !insideQuotes) {
      currentRow.push(currentValue.trim())
      currentValue = ""
      continue
    }

    if (
      (character === "\n" || character === "\r") &&
      !insideQuotes
    ) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1
      }

      currentRow.push(currentValue.trim())

      const hasContent = currentRow.some(
        (value) => value.trim() !== ""
      )

      if (hasContent) {
        rows.push(currentRow)
      }

      currentRow = []
      currentValue = ""
      continue
    }

    currentValue += character
  }

  currentRow.push(currentValue.trim())

  if (currentRow.some((value) => value.trim() !== "")) {
    rows.push(currentRow)
  }

  return rows
}

function findDetectedColumn(
  headers: string[],
  patterns: string[]
): {
  column: string | null
  confidence: number
} {
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }))

  for (const pattern of patterns) {
    const exactMatch = normalizedHeaders.find(
      (header) => header.normalized === pattern
    )

    if (exactMatch) {
      return {
        column: exactMatch.original,
        confidence: 100,
      }
    }
  }

  for (const pattern of patterns) {
    const partialMatch = normalizedHeaders.find(
      (header) =>
        header.normalized.includes(pattern) ||
        pattern.includes(header.normalized)
    )

    if (partialMatch) {
      return {
        column: partialMatch.original,
        confidence: 80,
      }
    }
  }

  return {
    column: null,
    confidence: 0,
  }
}

function createRows(
  headers: string[],
  values: string[][]
): CsvRow[] {
  return values.map((row) => {
    const result: CsvRow = {}

    headers.forEach((header, index) => {
      result[header] = row[index] ?? ""
    })

    return result
  })
}

export default function CsvImportPage() {
  const [fileName, setFileName] = useState("")
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<CsvRow[]>([])
  const [rawMatrix, setRawMatrix] = useState<string[][]>([])
  const [sourceHash, setSourceHash] = useState("")
  const [fingerprint, setFingerprint] = useState("")
  const [error, setError] = useState("")
  const [isDragging, setIsDragging] = useState(false)

  const [selectedImportType, setSelectedImportType] =
    useState<ImportType | null>(null)

  const [analysisConfirmed, setAnalysisConfirmed] =
    useState(false)
  const [identityCandidates, setIdentityCandidates] = useState<Map<string, PlayerMatch>>(new Map())
  const [identityLoading, setIdentityLoading] = useState(false)

  const historicalMatchPreview = useMemo(
    () => selectedImportType === "match" && analysisConfirmed && rawMatrix.length > 0
      ? previewHistoricalMatchCsv(rawMatrix)
      : null,
    [analysisConfirmed, rawMatrix, selectedImportType]
  )

  useEffect(() => {
    if (!historicalMatchPreview) return
    let cancelled = false
    void previewFingerprint(historicalMatchPreview).then((value) => {
      if (!cancelled) setFingerprint(value)
    })
    return () => { cancelled = true }
  }, [historicalMatchPreview])

  useEffect(() => {
    if (!historicalMatchPreview) return

    let cancelled = false
    const names = historicalMatchPreview.divisions.flatMap((division) =>
      division.standings.map((standing) => standing.historicalDisplayName)
    )
    Promise.all([loadPlayers(), loadPlayerAliases()])
      .then(([players, aliases]) => {
        if (cancelled) return
        const matches = matchPlayers(names, players, aliases)
        setIdentityCandidates(new Map(matches.map((match) => [match.importedName, match])))
        setIdentityLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setIdentityCandidates(new Map())
          setIdentityLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [historicalMatchPreview])

  const detectedColumns = useMemo<DetectedColumn[]>(() => {
    if (headers.length === 0) {
      return []
    }

    return Object.entries(COLUMN_PATTERNS).map(
      ([purpose, patterns]) => {
        const result = findDetectedColumn(
          headers,
          patterns
        )

        return {
          purpose,
          column: result.column,
          confidence: result.confidence,
        }
      }
    )
  }, [headers])

  const selectedImportDetails = useMemo(() => {
    if (!selectedImportType) {
      return null
    }

    return (
      IMPORT_TYPES.find(
        (option) => option.value === selectedImportType
      ) ?? null
    )
  }, [selectedImportType])

  async function analyzeFile(file: File) {
    setError("")
    setFileName("")
    setHeaders([])
    setRows([])
    setRawMatrix([])
    setSourceHash("")
    setFingerprint("")
    setSelectedImportType(null)
    setAnalysisConfirmed(false)
    setIdentityCandidates(new Map())
    setIdentityLoading(false)

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please select a CSV file.")
      return
    }

    try {
      const originalBytes = await file.arrayBuffer()
      const text = new TextDecoder().decode(originalBytes)
      const parsedRows = parseCsv(text)

      if (parsedRows.length < 2) {
        setError(
          "The CSV must contain a header row and at least one data row."
        )
        return
      }

      const parsedHeaders = parsedRows[0].map(
        (header, index) =>
          header.trim() || `Column ${index + 1}`
      )

      const dataRows = createRows(
        parsedHeaders,
        parsedRows.slice(1)
      )

      setFileName(file.name)
      setSourceHash(await sourceSha256(originalBytes))
      setRawMatrix(parsedRows)
      setHeaders(parsedHeaders)
      setRows(dataRows)
    } catch (fileError) {
      console.error(fileError)

      setError(
        "The CSV could not be read. No data was imported."
      )
    }
  }

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0]

    if (file) {
      void analyzeFile(file)
    }

    event.target.value = ""
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)

    const file = event.dataTransfer.files?.[0]

    if (file) {
      void analyzeFile(file)
    }
  }

  function clearFile() {
    setFileName("")
    setHeaders([])
    setRows([])
    setRawMatrix([])
    setSourceHash("")
    setFingerprint("")
    setError("")
    setSelectedImportType(null)
    setAnalysisConfirmed(false)
    setIdentityCandidates(new Map())
    setIdentityLoading(false)
  }

  function confirmImportType() {
    if (!selectedImportType) {
      setError(
        "Choose the type of data contained in this CSV."
      )
      return
    }

    setError("")
    if (selectedImportType === "match") setIdentityLoading(true)
    setAnalysisConfirmed(true)
  }

  function changeImportType() {
    setAnalysisConfirmed(false)
  }

  const previewRows = rows.slice(0, 10)

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-indigo-400">
              Data Import Center
            </p>

            <h1 className="text-4xl font-bold">
              League CSV Analyzer
            </h1>

            <p className="mt-3 max-w-3xl text-zinc-400">
              Upload a CSV, review its structure, and identify
              the type of Krys League data it contains. Nothing
              is saved during this step.
            </p>
          </div>

          <Link
            href="/admin/import"
            className="rounded-lg border border-zinc-700 px-5 py-3 font-semibold text-zinc-200 transition hover:bg-zinc-800"
          >
            ← Import Center
          </Link>
        </div>

        <CommittedHistoricalMatchIdentities />

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
          <div
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`rounded-xl border-2 border-dashed p-10 text-center transition ${
              isDragging
                ? "border-indigo-400 bg-indigo-950/40"
                : "border-zinc-700 bg-zinc-950"
            }`}
          >
            <div className="text-5xl">📄</div>

            <h2 className="mt-4 text-2xl font-bold">
              Drop a CSV file here
            </h2>

            <p className="mt-2 text-zinc-400">
              Or choose a file from your computer.
            </p>

            <label className="mt-6 inline-flex cursor-pointer rounded-lg bg-indigo-600 px-6 py-3 font-semibold transition hover:bg-indigo-500">
              Choose CSV

              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>

          {error && (
            <div className="mt-5 rounded-lg border border-red-800 bg-red-950 p-4 text-red-200">
              ❌ {error}
            </div>
          )}
        </section>

        {fileName && (
          <>
            <section className="mt-8 grid gap-5 md:grid-cols-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                <p className="text-sm uppercase tracking-wide text-zinc-500">
                  File
                </p>

                <p className="mt-2 break-all text-lg font-bold">
                  {fileName}
                </p>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                <p className="text-sm uppercase tracking-wide text-zinc-500">
                  Data rows
                </p>

                <p className="mt-2 text-3xl font-bold">
                  {rows.length}
                </p>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                <p className="text-sm uppercase tracking-wide text-zinc-500">
                  Columns
                </p>

                <p className="mt-2 text-3xl font-bold">
                  {headers.length}
                </p>
              </div>
            </section>

            <section className="mt-8 rounded-2xl border border-indigo-800 bg-indigo-950/30 p-6">
              <div className="mb-6">
                <p className="text-sm font-bold uppercase tracking-widest text-indigo-300">
                  Step 1
                </p>

                <h2 className="mt-2 text-3xl font-bold">
                  What type of data is this?
                </h2>

                <p className="mt-2 text-zinc-300">
                  Choose the type that best describes the
                  uploaded file. This controls the column mapping
                  and validation rules used in the next step.
                </p>
              </div>

              {!analysisConfirmed ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {IMPORT_TYPES.map((option) => {
                      const isSelected =
                        selectedImportType === option.value

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            setSelectedImportType(option.value)
                          }
                          className={`rounded-xl border p-5 text-left transition ${
                            isSelected
                              ? "border-indigo-400 bg-indigo-900/60 ring-2 ring-indigo-400"
                              : "border-zinc-700 bg-zinc-950 hover:border-zinc-500"
                          }`}
                        >
                          <div className="flex items-start gap-4">
                            <span className="text-3xl">
                              {option.icon}
                            </span>

                            <div>
                              <h3 className="text-xl font-bold">
                                {option.label}
                              </h3>

                              <p className="mt-2 text-sm leading-6 text-zinc-400">
                                {option.description}
                              </p>
                            </div>
                          </div>

                          {option.expectedColumns.length > 0 && (
                            <div className="mt-4 border-t border-zinc-800 pt-4">
                              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                                Typical columns
                              </p>

                              <p className="mt-2 text-sm text-zinc-400">
                                {option.expectedColumns.join(", ")}
                              </p>
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={confirmImportType}
                      disabled={!selectedImportType}
                      className="rounded-lg bg-green-600 px-6 py-3 font-bold transition hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                    >
                      Confirm Data Type
                    </button>

                    <button
                      type="button"
                      onClick={clearFile}
                      className="rounded-lg border border-red-800 px-5 py-3 font-semibold text-red-300 transition hover:bg-red-950"
                    >
                      Clear File
                    </button>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-green-700 bg-green-950/50 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold uppercase tracking-wide text-green-300">
                        Selected data type
                      </p>

                      <h3 className="mt-2 text-2xl font-bold">
                        {selectedImportDetails?.icon}{" "}
                        {selectedImportDetails?.label}
                      </h3>

                      <p className="mt-2 text-green-100/80">
                        {selectedImportDetails?.description}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={changeImportType}
                      className="rounded-lg border border-green-700 px-4 py-2 font-semibold text-green-200 transition hover:bg-green-900"
                    >
                      Change Type
                    </button>
                  </div>

                  <div className="mt-6 rounded-lg bg-black/30 p-4">
                    <p className="font-semibold text-green-200">
                      Next step
                    </p>

                    <p className="mt-1 text-sm text-zinc-300">
                      We will map this file&apos;s columns to the
                      required {selectedImportDetails?.label} fields,
                      then match imported names to existing player
                      profiles.
                    </p>
                  </div>
                </div>
              )}
            </section>

            {historicalMatchPreview && (
              <HistoricalMatchPreview
                key={`${sourceHash}:${fingerprint}`}
                preview={historicalMatchPreview}
                identityCandidates={identityCandidates}
                identityLoading={identityLoading}
                sourceFilename={fileName}
                sourceSha256={sourceHash}
                previewFingerprint={fingerprint}
              />
            )}

            {!historicalMatchPreview && <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">
                    Automatic Column Detection
                  </h2>

                  <p className="mt-1 text-zinc-400">
                    These are suggestions only. You will confirm
                    the mappings before importing.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {detectedColumns.map((item) => (
                  <div
                    key={item.purpose}
                    className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
                  >
                    <p className="capitalize text-zinc-400">
                      {item.purpose.replaceAll("_", " ")}
                    </p>

                    {item.column ? (
                      <>
                        <p className="mt-2 font-bold text-green-300">
                          ✅ {item.column}
                        </p>

                        <p className="mt-1 text-sm text-zinc-500">
                          Confidence: {item.confidence}%
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 font-semibold text-yellow-300">
                        ⚠️ Not detected
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>}

            {!historicalMatchPreview && <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-2xl font-bold">
                CSV Preview
              </h2>

              <p className="mt-1 text-zinc-400">
                Showing the first {previewRows.length} of{" "}
                {rows.length} data rows.
              </p>

              <div className="mt-5 overflow-x-auto rounded-xl border border-zinc-800">
                <table className="min-w-full divide-y divide-zinc-800">
                  <thead className="bg-zinc-950">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-zinc-400">
                        Row
                      </th>

                      {headers.map((header) => (
                        <th
                          key={header}
                          className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-zinc-300"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-zinc-800">
                    {previewRows.map((row, rowIndex) => (
                      <tr
                        key={rowIndex}
                        className="bg-zinc-900 hover:bg-zinc-800/70"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-500">
                          {rowIndex + 1}
                        </td>

                        {headers.map((header) => (
                          <td
                            key={`${rowIndex}-${header}`}
                            className="max-w-xs whitespace-nowrap px-4 py-3 text-sm text-zinc-200"
                          >
                            {row[header] || (
                              <span className="text-zinc-600">
                                —
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>}

            {!historicalMatchPreview && <section className="mt-8 rounded-2xl border border-blue-800 bg-blue-950/40 p-6">
  <h2 className="text-xl font-bold text-blue-200">
    Ready for Import
  </h2>

  <p className="mt-2 text-blue-100/80">
    The next step will connect this page to the Import Engine.
    When you click Import, the website will:
  </p>

  <ul className="mt-4 space-y-2 text-blue-100">
    <li>📦 Create an import batch</li>
    <li>💾 Save every CSV row</li>
    <li>👤 Match players</li>
    <li>✅ Validate the data</li>
    <li>📊 Show the import results before anything is permanently imported</li>
  </ul>
</section>}
          </>
        )}
      </div>
    </main>
  )
}
