"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

type MonthlyRow = {
  canonicalPlayerId: string
  playerName: string
  year: number
  month: number
  division: string
  courseName: string
  difficulty: "easy" | "hard"
  score: number
  holeInOnes: number | null
  coursePlacement: number | null
  coursePoints: number | null
  overallPlacement: number | null
  coursesPlayed: number | null
  totalStrokes: number | null
  overallHoleInOnes: number | null
  overallPoints: number | null
}

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

function periodKey(row: Pick<MonthlyRow, "year" | "month">) {
  return `${row.year}-${String(row.month).padStart(2, "0")}`
}

function periodLabel(key: string) {
  const [year, month] = key.split("-").map(Number)
  return `${monthNames[month] || "Unknown month"} ${year}`
}

function displayValue(value: number | null) {
  return value === null ? "—" : value
}

export default function MonthliesPage() {
  const [rows, setRows] = useState<MonthlyRow[]>([])
  const [selectedYear, setSelectedYear] = useState("")
  const [selectedMonth, setSelectedMonth] = useState("")
  const [selectedDivision, setSelectedDivision] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    fetch("/api/monthlies/public", { cache: "no-store" })
      .then(async response => {
        const payload = await response.json() as { rows?: MonthlyRow[]; error?: string }
        if (!response.ok) throw new Error(payload.error || "Monthly history could not be loaded.")
        if (active) setRows(payload.rows || [])
      })
      .catch(caught => {
        if (active) setError(caught instanceof Error ? caught.message : "Monthly history could not be loaded.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const years = useMemo(() => Array.from(new Set(rows.map(row => row.year))).sort((left, right) => right - left), [rows])
  const months = useMemo(() => Array.from(new Set(rows.filter(row => !selectedYear || row.year === Number(selectedYear)).map(row => row.month))).sort((left, right) => left - right), [rows, selectedYear])
  const divisions = useMemo(() => Array.from(new Set(rows.filter(row => (!selectedYear || row.year === Number(selectedYear)) && (!selectedMonth || row.month === Number(selectedMonth))).map(row => row.division))).sort((left, right) => left.localeCompare(right)), [rows, selectedMonth, selectedYear])

  useEffect(() => {
    if (selectedYear && !years.includes(Number(selectedYear))) setSelectedYear("")
    if (selectedMonth && !months.includes(Number(selectedMonth))) setSelectedMonth("")
    if (selectedDivision && !divisions.includes(selectedDivision)) setSelectedDivision("")
  }, [divisions, months, selectedDivision, selectedMonth, selectedYear, years])

  const filteredRows = rows.filter(row =>
    (!selectedYear || row.year === Number(selectedYear)) &&
    (!selectedMonth || row.month === Number(selectedMonth)) &&
    (!selectedDivision || row.division === selectedDivision)
  )
  const periodCount = new Set(filteredRows.map(periodKey)).size
  const summaryRows = Array.from(new Map(filteredRows.map(row => [`${row.canonicalPlayerId}:${row.division}:${periodKey(row)}`, row])).values())
    .sort((left, right) => (left.overallPlacement ?? Number.MAX_SAFE_INTEGER) - (right.overallPlacement ?? Number.MAX_SAFE_INTEGER) || left.playerName.localeCompare(right.playerName))

  return (
    <main style={page}>
      <div style={container}>
        <Link href="/" style={backButton}>← Krys Leagues</Link>

        <section style={hero}>
          <p style={eyebrow}>Public results</p>
          <h1 style={title}>📅 Monthly Results</h1>
          <p style={subtitle}>Browse completed historical Monthly results by year, month, and division. Names shown here are current canonical Global Player names; current and incomplete periods are excluded.</p>
          <div style={summaryGrid}>
            <Summary label="Historical periods" value={new Set(rows.map(periodKey)).size} />
            <Summary label="Scored observations" value={rows.length.toLocaleString()} />
            <Summary label="Shown periods" value={periodCount} />
          </div>
        </section>

        {loading && <section style={card}><p>Loading completed Monthly results...</p></section>}
        {error && <section style={errorCard}><p>{error}</p></section>}
        {!loading && !error && rows.length === 0 && <section style={card}><p>No completed historical Monthly results are available yet.</p></section>}

        {!loading && !error && rows.length > 0 && <>
          <section style={card} aria-label="Monthly result filters">
            <div style={filterGrid}>
              <Filter label="Year" value={selectedYear} onChange={setSelectedYear} options={years.map(year => [String(year), String(year)])} />
              <Filter label="Month" value={selectedMonth} onChange={setSelectedMonth} options={months.map(month => [String(month), monthNames[month]])} />
              <Filter label="Division" value={selectedDivision} onChange={setSelectedDivision} options={divisions.map(division => [division, division])} />
            </div>
          </section>

          <section style={card} aria-label="Monthly overall standings">
            <div style={sectionHeading}><div><p style={eyebrow}>Overall standings / summary</p><h2 style={sectionTitle}>{selectedYear || selectedMonth || selectedDivision ? "Filtered Monthly results" : "All completed Monthly results"}</h2></div><span style={count}>{summaryRows.length} player/division entries</span></div>
            <div style={tableWrap}>
              <table style={table}><thead><tr><th>Player</th><th>Division</th><th>Period</th><th>Overall place</th><th>Courses played</th><th>Total strokes</th><th>Hole-in-ones</th><th>Overall points</th></tr></thead>
                <tbody>{summaryRows.map(row => <tr key={`${row.canonicalPlayerId}-${row.division}-${periodKey(row)}`}><td><Link href={`/players/${row.canonicalPlayerId}`} style={playerLink}>{row.playerName}</Link></td><td>{row.division}</td><td>{periodLabel(periodKey(row))}</td><td>{displayValue(row.overallPlacement)}</td><td>{displayValue(row.coursesPlayed)}</td><td>{displayValue(row.totalStrokes)}</td><td>{displayValue(row.overallHoleInOnes)}</td><td>{displayValue(row.overallPoints)}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section style={card} aria-label="Monthly course results">
            <div style={sectionHeading}><div><p style={eyebrow}>Course results</p><h2 style={sectionTitle}>Scores and course placements</h2></div><span style={count}>{filteredRows.length} scored observations</span></div>
            <div style={tableWrap}>
              <table style={table}><thead><tr><th>Player</th><th>Period</th><th>Division</th><th>Course</th><th>Difficulty</th><th>Score</th><th>Hole-in-ones</th><th>Course place</th><th>Course points</th></tr></thead>
                <tbody>{filteredRows.map((row, index) => <tr key={`${row.canonicalPlayerId}-${periodKey(row)}-${row.division}-${row.courseName}-${row.difficulty}-${index}`}><td><Link href={`/players/${row.canonicalPlayerId}`} style={playerLink}>{row.playerName}</Link></td><td>{periodLabel(periodKey(row))}</td><td>{row.division}</td><td>{row.courseName}</td><td style={{ color: row.difficulty === "easy" ? "#86efac" : "#fca5a5", fontWeight: 700 }}>{row.difficulty}</td><td><strong>{row.score}</strong></td><td>{displayValue(row.holeInOnes)}</td><td>{displayValue(row.coursePlacement)}</td><td>{displayValue(row.coursePoints)}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        </>}
      </div>
    </main>
  )
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label style={filterLabel}>{label}<select value={value} onChange={event => onChange(event.target.value)} style={select}><option value="">All</option>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return <div style={summaryCard}><span>{label}</span><strong>{value}</strong></div>
}

const page: React.CSSProperties = { minHeight: "100vh", background: "radial-gradient(circle at top, #172554 0%, #020617 48%, #000000 100%)", color: "white", padding: "30px 18px" }
const container: React.CSSProperties = { width: "100%", maxWidth: 1500, margin: "0 auto" }
const backButton: React.CSSProperties = { display: "inline-block", marginBottom: 18, padding: "10px 16px", background: "#1e293b", border: "1px solid #475569", borderRadius: 10, color: "white", textDecoration: "none", fontWeight: 700 }
const hero: React.CSSProperties = { padding: 26, background: "rgba(2, 6, 23, 0.9)", border: "1px solid #334155", borderRadius: 20, marginBottom: 20 }
const eyebrow: React.CSSProperties = { margin: "0 0 8px", color: "#93c5fd", fontSize: 13, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" }
const title: React.CSSProperties = { margin: 0, fontSize: 42 }
const sectionTitle: React.CSSProperties = { margin: 0, fontSize: 28 }
const subtitle: React.CSSProperties = { color: "#cbd5e1", fontSize: 18, lineHeight: 1.5, maxWidth: 1000 }
const summaryGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginTop: 22, maxWidth: 720 }
const summaryCard: React.CSSProperties = { display: "grid", gap: 6, padding: 16, background: "#0f172a", border: "1px solid #334155", borderRadius: 12 }
const card: React.CSSProperties = { background: "#0f172a", border: "1px solid #334155", borderRadius: 16, padding: 24, marginBottom: 20 }
const errorCard: React.CSSProperties = { ...card, color: "#fecaca" }
const filterGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16 }
const filterLabel: React.CSSProperties = { display: "grid", gap: 6, color: "#cbd5e1", fontWeight: 700 }
const select: React.CSSProperties = { minWidth: 160, padding: "10px 12px", background: "#020617", border: "1px solid #475569", borderRadius: 8, color: "white" }
const sectionHeading: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "end", gap: 18, flexWrap: "wrap", marginBottom: 18 }
const count: React.CSSProperties = { color: "#cbd5e1", fontSize: 14 }
const tableWrap: React.CSSProperties = { overflowX: "auto" }
const table: React.CSSProperties = { width: "100%", minWidth: 1050, borderCollapse: "collapse" }
const playerLink: React.CSSProperties = { color: "#bfdbfe", fontWeight: 800, textDecoration: "none" }
