"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import styles from "./page.module.css"
import { monthlyCourseMapName, type MonthlyPresentationRow } from "@/lib/monthlyPresentation"

type MonthlyRow = MonthlyPresentationRow

type PeriodOption = {
  year: number
  month: number
  divisions: string[]
}

type Selection = {
  year: number
  month: number
  division: string
}

type MonthlyPayload = {
  rows?: MonthlyRow[]
  availablePeriods?: PeriodOption[]
  selected?: Selection
  error?: string
}

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

function periodLabel(year: number, month: number) {
  return `${monthNames[month] || "Unknown month"} ${year}`
}

function displayValue(value: number | null) {
  return value === null ? "—" : value
}

function placementLabel(value: number | null) {
  if (value === null) return "—"
  const suffix = value % 100 >= 11 && value % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[value % 10] || "th"
  return `${value}${suffix}`
}

function sameSelection(left: Selection | null, right: Selection | null) {
  return Boolean(left && right && left.year === right.year && left.month === right.month && left.division === right.division)
}

export default function MonthliesPage() {
  const [rows, setRows] = useState<MonthlyRow[]>([])
  const [periodOptions, setPeriodOptions] = useState<PeriodOption[]>([])
  const [selection, setSelection] = useState<Selection | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const params = new URLSearchParams()
    if (selection) {
      params.set("year", String(selection.year))
      params.set("month", String(selection.month))
      if (selection.division) params.set("division", selection.division)
    }

    fetch(`/api/monthlies/public${params.size ? `?${params.toString()}` : ""}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const payload = await response.json() as MonthlyPayload
        if (!response.ok) throw new Error(payload.error || "Monthly history could not be loaded.")
        if (!active) return
        setRows(payload.rows || [])
        setPeriodOptions(payload.availablePeriods || [])
        if (payload.selected && !sameSelection(selection, payload.selected)) {
          setLoading(true)
          setSelection(payload.selected)
        }
        setError("")
      })
      .catch(caught => {
        if (active && !(caught instanceof DOMException && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : "Monthly history could not be loaded.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [selection])

  const yearOptions = useMemo(() => Array.from(new Set(periodOptions.map(period => period.year))).sort((left, right) => right - left), [periodOptions])
  const monthOptions = useMemo(() => Array.from(new Set(periodOptions.filter(period => !selection || period.year === selection.year).map(period => period.month))).sort((left, right) => left - right), [periodOptions, selection])
  const divisionOptions = useMemo(() => {
    const period = periodOptions.find(option => option.year === selection?.year && option.month === selection?.month)
    return period?.divisions || []
  }, [periodOptions, selection])
  const sortedPeriods = useMemo(() => [...periodOptions].sort((left, right) => right.year - left.year || right.month - left.month), [periodOptions])
  const currentPeriodIndex = sortedPeriods.findIndex(period => period.year === selection?.year && period.month === selection?.month)

  const summaryRows = useMemo(() => Array.from(new Map(rows.map(row => [row.canonicalPlayerId, row])).values())
    .sort((left, right) => (left.overallPlacement ?? Number.MAX_SAFE_INTEGER) - (right.overallPlacement ?? Number.MAX_SAFE_INTEGER) || left.playerName.localeCompare(right.playerName)), [rows])

  const courseGroups = useMemo(() => {
    const groups = new Map<string, { name: string; easy: MonthlyRow[]; hard: MonthlyRow[] }>()
    for (const row of rows) {
      const name = monthlyCourseMapName(row.courseName)
      const group = groups.get(name) || { name, easy: [], hard: [] }
      group[row.difficulty].push(row)
      groups.set(name, group)
    }
    return Array.from(groups.values()).sort((left, right) => left.name.localeCompare(right.name))
  }, [rows])

  function updateSelection(field: keyof Selection, value: string) {
    if (!selection) return
    const numericValue = field === "year" || field === "month" ? Number(value) : value
    setLoading(true)
    setSelection({ ...selection, [field]: numericValue } as Selection)
  }

  function movePeriod(offset: number) {
    const period = sortedPeriods[currentPeriodIndex + offset]
    if (!period) return
    setLoading(true)
    setSelection({ year: period.year, month: period.month, division: period.divisions[0] || "" })
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <Link href="/" className={styles.backLink}>← Krys Leagues</Link>

        <section className={styles.hero}>
          <p className={styles.eyebrow}>Krys Leagues · Monthly</p>
          <div className={styles.periodHeading}>
            <div>
              <h1 className={styles.title}>{selection ? `${periodLabel(selection.year, selection.month).toUpperCase()} MONTHLY RESULTS` : "MONTHLY RESULTS"}</h1>
              {selection?.division && <p className={styles.divisionTitle}>{selection.division}</p>}
            </div>
            <p className={styles.periodHint}>Completed historical results</p>
          </div>
          <p className={styles.subtitle}>Browse one completed month and division at a time. Player names are current canonical Global Player names; current and incomplete periods are excluded.</p>

          <div className={styles.controls} aria-label="Monthly result filters">
            <label className={styles.filter}>Year
              <select className={styles.select} value={selection?.year || ""} onChange={event => updateSelection("year", event.target.value)} disabled={!selection}>
                {yearOptions.map(year => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <label className={styles.filter}>Month
              <select className={styles.select} value={selection?.month || ""} onChange={event => updateSelection("month", event.target.value)} disabled={!selection}>
                {monthOptions.map(month => <option key={month} value={month}>{monthNames[month]}</option>)}
              </select>
            </label>
            <label className={styles.filter}>Division
              <select className={styles.select} value={selection?.division || ""} onChange={event => updateSelection("division", event.target.value)} disabled={!selection}>
                {divisionOptions.map(division => <option key={division} value={division}>{division}</option>)}
              </select>
            </label>
          </div>

          <div className={styles.periodNav} aria-label="Monthly period navigation">
            <button type="button" className={styles.navButton} onClick={() => movePeriod(1)} disabled={currentPeriodIndex < 0 || currentPeriodIndex >= sortedPeriods.length - 1}>← Previous Month</button>
            <span className={styles.periodHint}>{selection ? periodLabel(selection.year, selection.month) : "Loading completed periods…"}</span>
            <button type="button" className={styles.navButton} onClick={() => movePeriod(-1)} disabled={currentPeriodIndex <= 0}>Next Month →</button>
          </div>
        </section>

        {loading && <section className={styles.status}>Loading the selected Monthly results…</section>}
        {error && <section className={`${styles.status} ${styles.error}`} role="alert">{error}</section>}
        {!loading && !error && rows.length === 0 && <section className={styles.status}>No completed results are available for this selection.</section>}

        {!loading && !error && rows.length > 0 && <>
          <section className={styles.section} aria-label="Monthly overall standings">
            <div className={styles.sectionHeader}>
              <div><p className={styles.eyebrow}>Overall standings</p><h2 className={styles.sectionTitle}>{selection ? periodLabel(selection.year, selection.month) : "Monthly results"}</h2></div>
              <span className={styles.sectionMeta}>{summaryRows.length} players</span>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Place</th><th>Player</th><th>Courses Played</th><th>Total Strokes</th><th>Hole-in-Ones</th><th>Overall Points</th></tr></thead>
                <tbody>{summaryRows.map(row => <tr key={row.canonicalPlayerId}>
                  <td className={styles.place}>{placementLabel(row.overallPlacement)}</td>
                  <td><Link href={`/players/${row.canonicalPlayerId}`} className={styles.playerLink}>{row.playerName}</Link></td>
                  <td>{displayValue(row.coursesPlayed)}</td><td>{displayValue(row.totalStrokes)}</td><td>{displayValue(row.overallHoleInOnes)}</td><td>{displayValue(row.overallPoints)}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className={styles.section} aria-label="Monthly course results">
            <div className={styles.sectionHeader}><div><p className={styles.eyebrow}>Course results</p><h2 className={styles.sectionTitle}>Maps and course placements</h2></div><span className={styles.sectionMeta}>{courseGroups.length} maps</span></div>
            <div className={styles.courseGrid}>
              {courseGroups.map(group => <article key={group.name} className={styles.courseCard}>
                <h3 className={styles.courseTitle}>{group.name}</h3>
                <div className={styles.difficultyGrid}>
                  <DifficultyTable difficulty="easy" rows={group.easy} />
                  <DifficultyTable difficulty="hard" rows={group.hard} />
                </div>
              </article>)}
            </div>
          </section>
        </>}
      </div>
    </main>
  )
}

function DifficultyTable({ difficulty, rows }: { difficulty: "easy" | "hard"; rows: MonthlyRow[] }) {
  return <div className={`${styles.difficultyPanel} ${difficulty === "hard" ? styles.hard : ""}`}>
    <h4 className={styles.difficultyHeading}>{difficulty}</h4>
    {rows.length === 0 ? <p className={styles.emptyCourse}>No submitted scores</p> : <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th>Place</th><th>Player</th><th>Score</th><th>HIO</th><th>Points</th></tr></thead>
        <tbody>{rows.slice().sort((left, right) => (left.coursePlacement ?? Number.MAX_SAFE_INTEGER) - (right.coursePlacement ?? Number.MAX_SAFE_INTEGER) || left.playerName.localeCompare(right.playerName)).map((row, index) => <tr key={`${row.canonicalPlayerId}-${row.courseName}-${row.difficulty}-${index}`}>
          <td className={styles.place}>{placementLabel(row.coursePlacement)}</td>
          <td><Link href={`/players/${row.canonicalPlayerId}`} className={styles.playerLink}>{row.playerName}</Link></td>
          <td><strong>{row.score}</strong></td><td>{displayValue(row.holeInOnes)}</td><td>{displayValue(row.coursePoints)}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </div>
}
