"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { buildKwtCourseRecords, KWT_DIFFICULTY_ORDER, KWT_RANK_ORDER, type KwtCourseRecord, type KwtCourseRecordEntry, type KwtCourseRecordRow, type KwtRank } from "@/lib/kwtRecords"
import { supabase } from "@/lib/supabase"

export default function KWTRecordsPage() {
  const [rows, setRows] = useState<KwtCourseRecordRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [selectedCourse, setSelectedCourse] = useState("")
  const courseRecords = useMemo(() => buildKwtCourseRecords(rows), [rows])
  const filteredCourses = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return courseRecords
    return courseRecords.filter((course) => [course.courseName, course.courseCode, ...course.courseCodes].some(value => value.toLowerCase().includes(normalized)))
  }, [courseRecords, query])
  const selected = filteredCourses.find(course => course.courseCode.toUpperCase() === selectedCourse) ?? filteredCourses[0]

  useEffect(() => {
    let mounted = true
    void supabase.rpc("get_public_kwt_course_records").then(({ data, error: responseError }) => {
      if (!mounted) return
      if (responseError) setError("KWT course records are not available until the KWT course-records release is installed.")
      else setRows((data || []) as KwtCourseRecordRow[])
      setLoading(false)
    })
    return () => { mounted = false }
  }, [])


  return (
    <main style={page}>
      <div style={shell}>
        <Link href="/kwt" style={back}>← Back to KWT</Link>
        <header style={header}>
          <p style={eyebrow}>KRYS LEAGUES · KWT</p>
          <h1 style={title}>KWT Records</h1>
        </header>

        <section style={section} aria-labelledby="records-title">
          <h2 id="records-title" style={srOnly}>KWT Course Records</h2>
          {loading && <p style={empty}>Loading KWT course records…</p>}
          {!loading && error && <p role="alert" style={empty}>{error}</p>}
          {!loading && !error && courseRecords.length === 0 && <p style={empty}>No KWT course records are currently available.</p>}
          {!loading && !error && courseRecords.length > 0 && (
            <div>
              <label style={selectorLabel} htmlFor="kwt-course-search">Select course</label>
              <input id="kwt-course-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search course or code" style={selectorInput} list="kwt-course-options" />
              <datalist id="kwt-course-options">{filteredCourses.map(course => <option key={course.courseCode} value={course.courseName}>{course.courseCodes.join(" / ")}</option>)}</datalist>
              <div style={courseOptions} role="listbox" aria-label="KWT courses">
                {filteredCourses.map(course => <button type="button" key={course.courseCode} role="option" aria-selected={selected?.courseCode === course.courseCode} style={selected?.courseCode === course.courseCode ? selectedOption : courseOption} onClick={() => { setSelectedCourse(course.courseCode.toUpperCase()); setQuery(course.courseName) }}>{course.courseName}</button>)}
              </div>
              {selected && <MapBoard course={selected} />}
            </div>
          )}
        </section>

        <section style={section} aria-labelledby="badges-title">
          <h2 id="badges-title">KWT Achievements</h2>
          <p style={empty}>No recorded KWT achievement ownership is available yet. Badge evidence is not inferred from other leagues or player-profile labels.</p>
        </section>
      </div>
    </main>
  )
}

function MapBoard({ course }: { course: KwtCourseRecord }) {
  return (
    <article style={courseCard}>
      <h3 style={mapTitle}>{course.courseName}</h3>
      <div style={difficultyGrid}>
        {KWT_DIFFICULTY_ORDER.map((difficulty) => <DifficultyBoard key={difficulty} difficulty={difficulty} records={course.records[difficulty]} />)}
      </div>
      <section style={combinedSection} aria-labelledby={`${course.courseCode}-combined`}>
        <h4 id={`${course.courseCode}-combined`} style={combinedTitle}>Best Combined</h4>
        <RecordTable records={course.records.Combined} />
      </section>
    </article>
  )
}

function DifficultyBoard({ difficulty, records }: { difficulty: "Easy" | "Hard"; records: KwtCourseRecord["records"]["Easy"] }) {
  return (
    <section style={difficultyPanel} aria-labelledby={`${difficulty.toLowerCase()}-records`}>
      <h4 id={`${difficulty.toLowerCase()}-records`} style={difficulty === "Easy" ? easyTitle : hardTitle}>{difficulty}</h4>
      <RecordTable records={records} />
    </section>
  )
}

function RecordTable({ records }: { records: KwtCourseRecord["records"]["Easy"] }) {
  const entries = ([{ label: "Overall", rank: null, record: records.overall }, ...KWT_RANK_ORDER.map(rank => ({ label: rank, rank, record: records.ranks[rank] }))] as Array<{ label: string; rank: KwtRank | null; record: KwtCourseRecordEntry | undefined }>).flatMap((entry) => entry.record ? [{ ...entry, record: entry.record }] : [])
  if (entries.length === 0) return <p style={emptyTable}>No records available.</p>
  return (
    <div style={tableWrap}>
      <table style={recordTable}>
        <thead><tr><th style={tableHeader}>Rank</th><th style={tableHeader}>Season/Week</th><th style={tableHeader}>Score</th><th style={tableHeader}>Player</th></tr></thead>
        <tbody>{entries.flatMap(entry => entry.record.holders.map(holder => <tr key={`${entry.label}-${holder.playerId}-${holder.seasonNumber ?? ""}-${holder.weekNumber ?? ""}`}>
          <th scope="row" style={{ ...tableCell, ...rankColor(entry.rank) }}>{entry.label}</th>
          <td style={tableCell}>{provenance(holder.seasonNumber, holder.weekNumber)}</td>
          <td style={{ ...tableCell, ...score }}>{entry.record.score}</td>
          <td style={tableCell}><Link href={`/players/${holder.playerId}`} style={playerLink}>{holder.screenName}</Link></td>
        </tr>))}</tbody>
      </table>
    </div>
  )
}

function provenance(season: number | null, week: number | null): string {
  return season !== null && week !== null ? `S${season} W${week}` : "—"
}

function rankColor(rank: KwtRank | null): React.CSSProperties {
  if (rank === "Amateur") return { color: "#c084fc" }
  if (rank === "Semi-Pro") return { color: "#60a5fa" }
  if (rank === "Pro") return { color: "#f87171" }
  if (rank === "Elite") return { color: "#fb923c" }
  return { color: "#d7deed" }
}

const page: React.CSSProperties = { minHeight: "100vh", background: "#05020d", color: "#fff", padding: "clamp(16px, 3vw, 40px)" }
const shell: React.CSSProperties = { width: "min(100%, 1160px)", margin: "0 auto" }
const back: React.CSSProperties = { display: "inline-flex", color: "#fff", textDecoration: "none", border: "1px solid #b26cff", borderRadius: 999, padding: "10px 16px", background: "#140927", fontWeight: 800 }
const header: React.CSSProperties = { margin: "28px 0 22px" }
const eyebrow: React.CSSProperties = { color: "#4de8ff", letterSpacing: ".16em", fontSize: ".78rem", fontWeight: 800 }
const title: React.CSSProperties = { margin: "6px 0", fontSize: "clamp(2rem, 5vw, 4rem)" }
const section: React.CSSProperties = { marginTop: 20, padding: "clamp(16px, 3vw, 28px)", border: "1px solid #54378a", borderRadius: 20, background: "#100d2a" }
const srOnly: React.CSSProperties = { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }
const selectorLabel: React.CSSProperties = { display: "block", textTransform: "uppercase", letterSpacing: ".12em", color: "#cbd5e1", fontWeight: 900, marginBottom: 8 }
const selectorInput: React.CSSProperties = { width: "100%", padding: "13px 15px", borderRadius: 12, border: "1px solid #6680a9", background: "#071226", color: "#fff", fontSize: "1rem" }
const courseOptions: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }
const courseOption: React.CSSProperties = { border: "1px solid #385b89", borderRadius: 999, background: "#071226", color: "#dbeafe", padding: "9px 13px", cursor: "pointer" }
const selectedOption: React.CSSProperties = { ...courseOption, borderColor: "#4de8ff", color: "#fff", boxShadow: "0 0 0 2px #4de8ff33" }
const courseCard: React.CSSProperties = { marginTop: 24, padding: "clamp(14px, 2vw, 22px)", borderRadius: 16, background: "#0d1630", border: "1px solid #2d73aa" }
const mapTitle: React.CSSProperties = { margin: "0 0 18px", textAlign: "center", fontSize: "clamp(1.7rem, 4vw, 3rem)", letterSpacing: ".04em", textTransform: "uppercase", overflowWrap: "anywhere" }
const difficultyGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 14 }
const difficultyPanel: React.CSSProperties = { padding: 14, borderRadius: 12, background: "#071226", border: "1px solid #385b89" }
const easyTitle: React.CSSProperties = { color: "#4ade80", textAlign: "center", margin: "0 0 10px", letterSpacing: ".12em" }
const hardTitle: React.CSSProperties = { color: "#f87171", textAlign: "center", margin: "0 0 10px", letterSpacing: ".12em" }
const combinedSection: React.CSSProperties = { marginTop: 22, padding: 14, borderRadius: 12, background: "#071226", border: "1px solid #385b89" }
const combinedTitle: React.CSSProperties = { textAlign: "center", textTransform: "uppercase", margin: "0 0 10px", color: "#fbbf24", letterSpacing: ".12em" }
const tableWrap: React.CSSProperties = { width: "100%", overflowX: "auto" }
const recordTable: React.CSSProperties = { width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: 460 }
const tableHeader: React.CSSProperties = { padding: "8px 7px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".08em", fontSize: ".72rem", borderBottom: "1px solid #ffffff2b" }
const tableCell: React.CSSProperties = { padding: "10px 7px", borderBottom: "1px solid #ffffff18", verticalAlign: "top" }
const score: React.CSSProperties = { color: "#7dd3fc", fontWeight: 950, fontVariantNumeric: "tabular-nums" }
const playerLink: React.CSSProperties = { color: "#86e7ff", fontWeight: 800 }
const emptyTable: React.CSSProperties = { color: "#8d9ab3", margin: "8px 0" }
const empty: React.CSSProperties = { marginTop: 18, padding: 18, borderRadius: 12, border: "1px dashed #76569d", color: "#d8c9ed", background: "rgba(0,0,0,.22)" }
