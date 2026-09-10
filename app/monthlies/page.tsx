"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { artworkTargetStyle, validateArtworkHitboxes } from "@/lib/artworkNavigation"
import { monthlyArtwork, monthlyArtworkOverlayTargets } from "@/lib/artworkPageMaps"
import {
  divisionOptionsForSelection,
  emptyMonthlySelection,
  initializeMonthlySelection,
  monthOptionsForYear,
  resetAfterMonthChange,
  resetAfterYearChange,
  selectionForPeriod,
  shouldLoadMonthlyResults,
  type MonthlyFilterSelection,
  type MonthlyPeriodOption,
} from "@/lib/monthlyPublicView"
import { monthlyCourseMapName, type MonthlyPresentationRow } from "@/lib/monthlyPresentation"
import styles from "./page.module.css"

type MonthlyRow = MonthlyPresentationRow

type MonthlyPayload = {
  rows?: MonthlyRow[]
  availablePeriods?: MonthlyPeriodOption[]
  error?: string
}

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const monthlyOverlayErrors = validateArtworkHitboxes(monthlyArtworkOverlayTargets)
if (monthlyOverlayErrors.length > 0) throw new Error(`Invalid Monthly artwork controls: ${monthlyOverlayErrors.join("; ")}`)

function periodLabel(year: number | "", month: number | "") {
  return typeof year === "number" && typeof month === "number" ? `${monthNames[month] || "Unknown month"} ${year}` : "Monthly results"
}

function displayValue(value: number | null) {
  return value === null ? "—" : value
}

function placementLabel(value: number | null) {
  if (value === null) return "—"
  const suffix = value % 100 >= 11 && value % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[value % 10] || "th"
  return `${value}${suffix}`
}

export default function MonthliesPage() {
  const [rows, setRows] = useState<MonthlyRow[]>([])
  const [periodOptions, setPeriodOptions] = useState<MonthlyPeriodOption[]>([])
  const [selection, setSelection] = useState<MonthlyFilterSelection>(emptyMonthlySelection)
  const [metadataLoading, setMetadataLoading] = useState(true)
  const [resultsLoading, setResultsLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    fetch("/api/monthlies/public?metadataOnly=true", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const payload = await response.json() as MonthlyPayload
        if (!response.ok) throw new Error(payload.error || "Monthly history could not be loaded.")
        if (!active) return
        const periods = payload.availablePeriods || []
        setPeriodOptions(periods)
        setSelection(current => current.year === "" ? initializeMonthlySelection(periods) : current)
        setError("")
      })
      .catch(caught => {
        if (active && !(caught instanceof DOMException && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : "Monthly history could not be loaded.")
      })
      .finally(() => {
        if (active) setMetadataLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (!shouldLoadMonthlyResults(selection)) {
      return
    }

    const controller = new AbortController()
    let active = true
    const params = new URLSearchParams({ year: String(selection.year), month: String(selection.month), division: selection.division })

    fetch(`/api/monthlies/public?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const payload = await response.json() as MonthlyPayload
        if (!response.ok) throw new Error(payload.error || "Monthly history could not be loaded.")
        if (!active) return
        setRows(payload.rows || [])
        setError("")
      })
      .catch(caught => {
        if (active && !(caught instanceof DOMException && caught.name === "AbortError")) {
          setRows([])
          setError(caught instanceof Error ? caught.message : "Monthly history could not be loaded.")
        }
      })
      .finally(() => {
        if (active) setResultsLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [selection])

  const yearOptions = useMemo(() => Array.from(new Set(periodOptions.map(period => period.year))).sort((left, right) => right - left), [periodOptions])
  const monthOptions = useMemo(() => monthOptionsForYear(periodOptions, selection.year), [periodOptions, selection.year])
  const divisionOptions = useMemo(() => divisionOptionsForSelection(periodOptions, selection), [periodOptions, selection])
  const sortedPeriods = useMemo(() => [...periodOptions].sort((left, right) => right.year - left.year || right.month - left.month), [periodOptions])
  const currentPeriodIndex = sortedPeriods.findIndex(period => period.year === selection.year && period.month === selection.month)
  const hasCompleteSelection = shouldLoadMonthlyResults(selection)

  function clearResults() {
    setRows([])
    setError("")
    setResultsLoading(false)
  }

  function handleYearChange(value: string) {
    clearResults()
    setSelection(resetAfterYearChange(value ? Number(value) : ""))
  }

  function handleMonthChange(value: string) {
    clearResults()
    setSelection(current => resetAfterMonthChange(current, value ? Number(value) : ""))
  }

  function handleDivisionChange(value: string) {
    clearResults()
    setResultsLoading(Boolean(value))
    setSelection(current => ({ ...current, division: value }))
  }

  function movePeriod(offset: number) {
    const period = sortedPeriods[currentPeriodIndex + offset]
    if (!period) return
    clearResults()
    setSelection(selectionForPeriod(period))
  }

  return (
    <div className={styles.page}>
      <ArtworkNavigation
        definition={monthlyArtwork}
        overlay={
          <div className={styles.controlsOverlay} aria-label="Monthly result filters">
            <label className={styles.controlHitbox} style={artworkTargetStyle(monthlyArtworkOverlayTargets[0])}>
              <span className={styles.srOnly}>Year</span>
              <select aria-label="Year" className={styles.artworkSelect} value={selection.year} onChange={event => handleYearChange(event.target.value)} disabled={metadataLoading}>
                <option value="">Select year</option>
                {yearOptions.map(year => <option key={year} value={year}>{year}</option>)}
              </select>
              <span aria-hidden="true" className={styles.yearValueMask} />
              <span aria-hidden="true" className={`${styles.artworkSelectedValue} ${styles.yearSelectedValue}`}>{selection.year}</span>
            </label>
            <label className={styles.controlHitbox} style={artworkTargetStyle(monthlyArtworkOverlayTargets[1])}>
              <span className={styles.srOnly}>Month</span>
              <select aria-label="Month" className={styles.artworkSelect} value={selection.month} onChange={event => handleMonthChange(event.target.value)} disabled={metadataLoading || selection.year === ""}>
                <option value="">Select month</option>
                {monthOptions.map(month => <option key={month} value={month}>{monthNames[month]}</option>)}
              </select>
              <span aria-hidden="true" className={`${styles.artworkValueMask} ${styles.monthValueMask}`} />
              <span aria-hidden="true" className={`${styles.artworkSelectedValue} ${styles.yearSelectedValue}`}>{selection.month ? monthNames[selection.month] : ""}</span>
            </label>
            <label className={styles.controlHitbox} style={artworkTargetStyle(monthlyArtworkOverlayTargets[2])}>
              <span className={styles.srOnly}>Division</span>
              <select aria-label="Division" className={styles.artworkSelect} value={selection.division} onChange={event => handleDivisionChange(event.target.value)} disabled={metadataLoading || selection.month === ""}>
                <option value="">Select division</option>
                {divisionOptions.map(division => <option key={division} value={division}>{division}</option>)}
              </select>
              <span aria-hidden="true" className={`${styles.artworkValueMask} ${styles.divisionValueMask}`} />
              <span aria-hidden="true" className={`${styles.artworkSelectedValue} ${styles.yearSelectedValue} ${selection.division.length > 14 ? styles.artworkSelectedValueLong : ""}`}>{selection.division}</span>
            </label>
            <button type="button" aria-label="Previous Month" className={styles.controlHitbox} style={artworkTargetStyle(monthlyArtworkOverlayTargets[3])} onClick={() => movePeriod(1)} disabled={selection.month === "" || currentPeriodIndex < 0 || currentPeriodIndex >= sortedPeriods.length - 1} />
            <button type="button" aria-label="Next Month" className={styles.controlHitbox} style={artworkTargetStyle(monthlyArtworkOverlayTargets[4])} onClick={() => movePeriod(-1)} disabled={selection.month === "" || currentPeriodIndex <= 0} />
          </div>
        }
      />

      <section className={styles.missionTagline} aria-label="Krys Leagues mission">
        <p>Ranks separate the competition — not the players.</p>
      </section>
      {error && <section className={`${styles.status} ${styles.error}`} role="alert">{error}</section>}
      {hasCompleteSelection && resultsLoading && <section className={styles.status}>Loading the selected Monthly results…</section>}
      {hasCompleteSelection && !resultsLoading && !error && rows.length === 0 && <section className={styles.status}>No completed results are available for this selection.</section>}

      {hasCompleteSelection && !resultsLoading && !error && rows.length > 0 && <MonthlyResults rows={rows} selection={selection} />}
    </div>
  )
}

function MonthlyResults({ rows, selection }: { rows: MonthlyRow[]; selection: MonthlyFilterSelection }) {
  const summaryRows = Array.from(new Map(rows.map(row => [row.canonicalPlayerId, row])).values())
    .sort((left, right) => (left.overallPlacement ?? Number.MAX_SAFE_INTEGER) - (right.overallPlacement ?? Number.MAX_SAFE_INTEGER) || left.playerName.localeCompare(right.playerName))
  const courseGroups = new Map<string, { name: string; easy: MonthlyRow[]; hard: MonthlyRow[] }>()

  for (const row of rows) {
    const name = monthlyCourseMapName(row.courseName)
    const group = courseGroups.get(name) || { name, easy: [], hard: [] }
    group[row.difficulty].push(row)
    courseGroups.set(name, group)
  }

  return <div className={styles.resultsShell} data-monthly-results="expanded">
    <section className={styles.resultsSection} aria-label="Monthly overall standings">
      <div className={styles.sectionHeader}><div><p className={styles.eyebrow}>Overall standings</p><h2 className={styles.sectionTitle}>{periodLabel(selection.year, selection.month)}</h2></div><span className={styles.sectionMeta}>{summaryRows.length} players</span></div>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Place</th><th>Player</th><th>Courses Played</th><th>Total Strokes</th><th>Hole-in-Ones</th><th>Overall Points</th></tr></thead><tbody>{summaryRows.map(row => <tr key={row.canonicalPlayerId}><td className={styles.place}>{placementLabel(row.overallPlacement)}</td><td><Link href={`/players/${row.canonicalPlayerId}`} className={styles.playerLink}>{row.playerName}</Link></td><td>{displayValue(row.coursesPlayed)}</td><td>{displayValue(row.totalStrokes)}</td><td>{displayValue(row.overallHoleInOnes)}</td><td>{displayValue(row.overallPoints)}</td></tr>)}</tbody></table></div>
    </section>

    <section className={styles.resultsSection} aria-label="Monthly course results">
      <div className={styles.sectionHeader}><div><p className={styles.eyebrow}>Course results</p><h2 className={styles.sectionTitle}>Maps and course placements</h2></div><span className={styles.sectionMeta}>{courseGroups.size} maps</span></div>
      <div className={styles.courseGrid}>{Array.from(courseGroups.values()).sort((left, right) => left.name.localeCompare(right.name)).map(group => <article key={group.name} className={styles.courseCard}><h3 className={styles.courseTitle}>{group.name}</h3><div className={styles.difficultyGrid}><DifficultyTable difficulty="easy" rows={group.easy} /><DifficultyTable difficulty="hard" rows={group.hard} /></div></article>)}</div>
    </section>
  </div>
}

function DifficultyTable({ difficulty, rows }: { difficulty: "easy" | "hard"; rows: MonthlyRow[] }) {
  return <div className={`${styles.difficultyPanel} ${difficulty === "hard" ? styles.hard : ""}`}><h4 className={styles.difficultyHeading}>{difficulty}</h4>{rows.length === 0 ? <p className={styles.emptyCourse}>No submitted scores</p> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Place</th><th>Player</th><th>Score</th><th>HIO</th><th>Points</th></tr></thead><tbody>{rows.slice().sort((left, right) => (left.coursePlacement ?? Number.MAX_SAFE_INTEGER) - (right.coursePlacement ?? Number.MAX_SAFE_INTEGER) || left.playerName.localeCompare(right.playerName)).map((row, index) => <tr key={`${row.canonicalPlayerId}-${row.courseName}-${row.difficulty}-${index}`}><td className={styles.place}>{placementLabel(row.coursePlacement)}</td><td><Link href={`/players/${row.canonicalPlayerId}`} className={styles.playerLink}>{row.playerName}</Link></td><td><strong>{row.score}</strong></td><td>{displayValue(row.holeInOnes)}</td><td>{displayValue(row.coursePoints)}</td></tr>)}</tbody></table></div>}</div>
}
