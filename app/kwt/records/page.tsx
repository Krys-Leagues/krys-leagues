"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { buildKwtCourseRecords, KWT_DIFFICULTY_ORDER, KWT_RANK_ORDER, type KwtCourseRecordRow } from "@/lib/kwtRecords"
import { supabase } from "@/lib/supabase"

export default function KWTRecordsPage() {
  const [rows, setRows] = useState<KwtCourseRecordRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const courseRecords = useMemo(() => buildKwtCourseRecords(rows), [rows])

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
          <h1 style={title}>KWT Records &amp; Achievements</h1>
          <p style={copy}>KWT-only course records and achievement evidence from the existing canonical KWT data.</p>
        </header>

        <section style={section} aria-labelledby="records-title">
          <h2 id="records-title">KWT Course Records</h2>
          <p style={sectionCopy}>Best legitimate score on each KWT course, separated by difficulty and the rank held when the score was recorded. More negative scores are better.</p>
          {loading && <p style={empty}>Loading KWT course records…</p>}
          {!loading && error && <p role="alert" style={empty}>{error}</p>}
          {!loading && !error && courseRecords.length === 0 && <p style={empty}>No KWT course records are currently available.</p>}
          {!loading && !error && courseRecords.length > 0 && (
            <div style={courseList}>
              {courseRecords.map((course) => (
                <article style={courseCard} key={course.courseCode}>
                  <header style={courseHeader}>
                    <h3>{course.courseName}</h3>
                    <span style={courseCode}>{course.courseCode}</span>
                  </header>
                  <div style={difficultyGrid}>
                    {KWT_DIFFICULTY_ORDER.map((difficulty) => (
                      <section style={difficultyPanel} key={difficulty} aria-labelledby={`${course.courseCode}-${difficulty}`}>
                        <h4 id={`${course.courseCode}-${difficulty}`}>{difficulty}</h4>
                        <div style={rankList}>
                          {KWT_RANK_ORDER.map((rank) => {
                            const record = course.records[difficulty][rank]
                            return (
                              <div style={rankRow} key={rank}>
                                <strong style={rankLabel}>{rank}</strong>
                                {record ? (
                                  <div>
                                    <div style={score}>Record: {record.score}</div>
                                    <ul style={holders}>
                                      {record.holders.map((holder) => <li key={holder.playerId}><Link href={`/players/${holder.playerId}`} style={playerLink}>{holder.screenName}</Link></li>)}
                                    </ul>
                                  </div>
                                ) : <span style={notRecorded}>No recorded score</span>}
                              </div>
                            )
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section style={section} aria-labelledby="badges-title">
          <h2 id="badges-title">KWT Achievements</h2>
          <p style={sectionCopy}>Badge-holder data is shown only when a persisted KWT ownership source resolves canonical players and real counts.</p>
          <p style={empty}>No recorded KWT achievement ownership is available yet. Badge evidence is not inferred from other leagues or player-profile labels.</p>
        </section>
      </div>
    </main>
  )
}

const page: React.CSSProperties = { minHeight: "100vh", background: "#05020d", color: "#fff", padding: "clamp(16px, 3vw, 40px)" }
const shell: React.CSSProperties = { width: "min(100%, 1160px)", margin: "0 auto" }
const back: React.CSSProperties = { display: "inline-flex", color: "#fff", textDecoration: "none", border: "1px solid #b26cff", borderRadius: 999, padding: "10px 16px", background: "#140927", fontWeight: 800 }
const header: React.CSSProperties = { margin: "28px 0 22px" }
const eyebrow: React.CSSProperties = { color: "#4de8ff", letterSpacing: ".16em", fontSize: ".78rem", fontWeight: 800 }
const title: React.CSSProperties = { margin: "6px 0", fontSize: "clamp(2rem, 5vw, 4rem)" }
const copy: React.CSSProperties = { color: "#c8bfe2" }
const section: React.CSSProperties = { marginTop: 20, padding: "clamp(16px, 3vw, 28px)", border: "1px solid #54378a", borderRadius: 20, background: "#100d2a" }
const sectionCopy: React.CSSProperties = { color: "#c8bfe2", lineHeight: 1.55 }
const courseList: React.CSSProperties = { display: "grid", gap: 16, marginTop: 18 }
const courseCard: React.CSSProperties = { padding: "clamp(14px, 2vw, 22px)", borderRadius: 16, background: "#0d1630", border: "1px solid #2d73aa" }
const courseHeader: React.CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }
const courseCode: React.CSSProperties = { color: "#91a7c9", fontFamily: "monospace", fontSize: ".85rem" }
const difficultyGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 14 }
const difficultyPanel: React.CSSProperties = { padding: 14, borderRadius: 12, background: "#071226", border: "1px solid #385b89" }
const rankList: React.CSSProperties = { display: "grid", gap: 8 }
const rankRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(78px, .55fr) minmax(0, 1fr)", gap: 10, alignItems: "start", padding: "9px 0", borderBottom: "1px solid #ffffff18" }
const rankLabel: React.CSSProperties = { color: "#c9d7ff" }
const score: React.CSSProperties = { color: "#7dd3fc", fontWeight: 950, fontVariantNumeric: "tabular-nums" }
const holders: React.CSSProperties = { margin: "4px 0 0", paddingLeft: 18 }
const playerLink: React.CSSProperties = { color: "#86e7ff", fontWeight: 800 }
const notRecorded: React.CSSProperties = { color: "#8d9ab3" }
const empty: React.CSSProperties = { marginTop: 18, padding: 18, borderRadius: 12, border: "1px dashed #76569d", color: "#d8c9ed", background: "rgba(0,0,0,.22)" }
