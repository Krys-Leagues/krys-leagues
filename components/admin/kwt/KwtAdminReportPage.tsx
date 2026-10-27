"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

type Report = {
  state: "AVAILABLE" | "UNAVAILABLE"
  event: { eventIdentifier: string; season: number; week: number; courseName: string; freezeCutoff: string | null } | null
  net: { state: string; rows: number; seasonRows: number }
  gross: { state: string; rows: number; divisions: Record<string, { players: number; easy: { score: number; name: string } | null; hard: { score: number; name: string } | null }> }
  workflow?: Record<string, string>
  blockers: string[]
}

const views = {
  results: ["Gross and NET Results", "Protected result reporting for the verified operational contract."],
  scorecards: ["Hole-by-Hole Scorecards", "Source evidence review remains separate from Production import and finalization."],
  divisions: ["Gross and NET Divisions", "Division and points reporting uses only verified operational rows."],
  finalization: ["Weekly Finalization", "Finalization is guarded and cannot activate or rewrite a week from this Preview."],
  aces: ["Ace Leaders and Gross Performance", "Hole-level performance is shown only when protected verified evidence is available."],
  history: ["Historical Weeks", "Historical weekly and season state is append-only and read-only here."],
} as const

export default function KwtAdminReportPage({ view }: { view: keyof typeof views }) {
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    void fetch("/api/admin/kwt/reporting", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error(response.status === 403 ? "KWT administrator authorization is required." : "KWT report could not be read.")
      setReport(await response.json() as Report)
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "KWT report could not be read."))
  }, [])
  const [title, subtitle] = views[view]
  return <main style={page}><div style={shell}>
    <Link href="/admin/kwt" style={back}>← KWT Admin</Link>
    <p style={eyebrow}>PROTECTED ADMIN REPORT · READ ONLY</p>
    <h1 style={titleStyle}>{title}</h1>
    <p style={subtitleStyle}>{subtitle}</p>
    {error && <p role="alert" style={empty}>{error}</p>}
    {!error && !report && <p role="status" style={empty}>Checking verified KWT operational state…</p>}
    {report && <>
      <section style={grid}>
        <Status label="Event" value={report.event ? `${report.event.eventIdentifier} · ${report.event.courseName}` : "NOT CONFIGURED"} />
        <Status label="NET results" value={`${report.net.rows} current · ${report.net.seasonRows} season`} />
        <Status label="Gross results" value={`${report.gross.rows} current operational rows`} />
        <Status label="State" value={report.state === "AVAILABLE" ? "VERIFIED DATA AVAILABLE" : "PENDING VERIFIED SETUP"} />
      </section>
      {report.event && <section style={card}><h2>Verified event identity</h2><p>Season {report.event.season} · Week {report.event.week} · {report.event.eventIdentifier} · {report.event.courseName}</p><p>Freeze cutoff: {report.event.freezeCutoff ?? "Not provided by the authorized setup"}</p></section>}
      <section style={card}><h2>Current protected workflow state</h2><div style={workflow}>{Object.entries(report.workflow ?? {}).map(([key, value]) => <div key={key}><strong>{labelize(key)}</strong><span>{labelize(value)}</span></div>)}</div></section>
      {report.gross.rows > 0 && <section style={card}><h2>Best gross scores by division</h2><div style={tableWrap}><table style={table}><thead><tr><th>Division</th><th>Players</th><th>Best Easy</th><th>Best Hard</th></tr></thead><tbody>{Object.entries(report.gross.divisions).map(([division, result]) => <tr key={division}><th scope="row">{division}</th><td>{result.players}</td><td>{result.easy ? `${result.easy.score} · ${result.easy.name}` : "—"}</td><td>{result.hard ? `${result.hard.score} · ${result.hard.name}` : "—"}</td></tr>)}</tbody></table></div></section>}
      {report.blockers.map((blocker) => <p key={blocker} style={warning}>{blocker}</p>)}
      <section style={card}><h2>Related protected workflows</h2><div style={links}>{Object.entries(views).map(([key, [label]]) => <Link key={key} href={`/admin/kwt/${key}`} style={smallLink}>{label}</Link>)}</div><Link href="/admin/kwt/week-01-scorecards" style={smallLink}>Open Week 01 source scorecard review</Link><Link href="/admin/kwt-import" style={smallLink}>Open CSV import review</Link></section>
    </>}
  </div></main>
}

function Status({ label, value }: { label: string; value: string }) { return <section style={status}><small>{label}</small><strong>{value}</strong></section> }
function labelize(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()) }

const page: React.CSSProperties = { minHeight: "100vh", padding: 24, background: "#05020d", color: "white" }
const shell: React.CSSProperties = { width: "min(100%, 1100px)", margin: "0 auto" }
const back: React.CSSProperties = { display: "inline-flex", color: "white", textDecoration: "none", border: "1px solid #4de8ff", borderRadius: 999, padding: "10px 16px" }
const eyebrow: React.CSSProperties = { marginTop: 28, color: "#74eaff", letterSpacing: ".14em", fontWeight: 900, fontSize: 12 }
const titleStyle: React.CSSProperties = { fontSize: "clamp(32px, 6vw, 54px)", margin: "8px 0" }
const subtitleStyle: React.CSSProperties = { color: "#b9c4dc", lineHeight: 1.55, maxWidth: 800 }
const empty: React.CSSProperties = { marginTop: 20, padding: 18, border: "1px dashed #76569d", borderRadius: 14, background: "#100d2a", color: "#e9ddff" }
const warning: React.CSSProperties = { marginTop: 20, padding: 18, border: "1px solid #854d0e", borderRadius: 14, background: "#241608", color: "#fde68a" }
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12, marginTop: 22 }
const status: React.CSSProperties = { display: "grid", gap: 8, padding: 16, border: "1px solid #385b89", borderRadius: 14, background: "#071226" }
const card: React.CSSProperties = { marginTop: 20, padding: 20, border: "1px solid #385b89", borderRadius: 14, background: "#071226" }
const workflow: React.CSSProperties = { display: "grid", gap: 10 }
const links: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }
const smallLink: React.CSSProperties = { display: "inline-flex", padding: "10px 13px", border: "1px solid #4de8ff", borderRadius: 10, color: "white", textDecoration: "none" }
const tableWrap: React.CSSProperties = { overflowX: "auto" }
const table: React.CSSProperties = { width: "100%", minWidth: 680, borderCollapse: "collapse", textAlign: "left" }
