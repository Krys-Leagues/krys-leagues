"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { KWT_SEASON_15_WEEKS } from "@/lib/kwtSeason15Competition"

type Setup = { state: "AVAILABLE" | "UNAVAILABLE"; event: { eventIdentifier: string; season: number; week: number; courseName: string; freezeCutoff: string | null } | null; reason: string | null }
type Report = { state: "AVAILABLE" | "UNAVAILABLE"; event: Setup["event"]; net: { state: string; rows: number; seasonRows: number }; gross: { state: string; rows: number }; blockers: string[] }

export default function KwtWeekManagementPage() {
  const [setup, setSetup] = useState<Setup | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    void Promise.all([
      fetch("/api/admin/kwt/week-setup", { cache: "no-store" }),
      fetch("/api/admin/kwt/reporting", { cache: "no-store" }),
    ]).then(async ([setupResponse, reportResponse]) => {
      if (!setupResponse.ok || !reportResponse.ok) {
        const response = !setupResponse.ok ? setupResponse : reportResponse
        throw new Error(response.status === 403 ? "KWT administrator authorization is required." : "KWT operational state could not be read.")
      }
      setSetup(await setupResponse.json() as Setup)
      setReport(await reportResponse.json() as Report)
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "Week setup could not be read."))
  }, [])
  return <main style={page}><div style={shell}>
    <Link href="/admin/kwt" style={back}>← KWT Admin</Link>
    <header><p style={eyebrow}>PROTECTED ADMIN WORKSPACE · NO AUTOMATIC ACTIVATION</p><h1 style={title}>Season 15 Week Management</h1><p style={subtitle}>The approved course order is staged locally. The owner-confirmed Week 01 freeze is 2026-10-23T04:00:00Z (Friday midnight America/New_York); Production still requires an authorized protected setup record before activation.</p></header>
    {error && <p role="alert" style={empty}>{error}</p>}
    {!error && <section style={statusCard}><strong>Current verified setup</strong><span>{setup?.state === "AVAILABLE" && setup.event ? `${setup.event.eventIdentifier} · ${setup.event.courseName}` : setup ? "NOT CONFIGURED" : "Checking…"}</span><small>{setup?.event?.freezeCutoff ? `Freeze cutoff: ${setup.event.freezeCutoff}` : "Owner-confirmed Week 01 cutoff is known locally; no protected Production setup is configured."}</small><button type="button" disabled style={disabled}>ACTIVATE NEXT WEEK · REQUIRES APPROVED SETUP</button></section>}
    <section style={card}><h2>Season 15 approved course order</h2><div style={tableWrap}><table style={table}><thead><tr><th>Week</th><th>Event</th><th>Course</th><th>Easy / Hard</th><th>Status</th></tr></thead><tbody>{KWT_SEASON_15_WEEKS.map((week) => <tr key={week.week}><th scope="row">{String(week.week).padStart(2, "0")}</th><td>{week.eventIdentifier}</td><td>{week.courseName}</td><td>{week.easyCourseCode} / {week.hardCourseCode}</td><td>{setup?.event?.week === week.week ? "CURRENT SETUP" : "STAGED"}</td></tr>)}</tbody></table></div></section>
    <p style={note}>{report?.gross.rows ? `Protected reporting confirms ${report.gross.rows} official Season 15 Week 01 operational result rows and ${report.net.rows} NET rows for this setup.` : "No verified Season 15 Week 01 operational result rows are available to this administrator."} No activation, import, finalization, trophy, Discord-role, or database action is available from this Preview.</p>
  </div></main>
}

const page: React.CSSProperties = { minHeight: "100vh", padding: 24, background: "#05020d", color: "white" }
const shell: React.CSSProperties = { width: "min(100%, 1100px)", margin: "0 auto" }
const back: React.CSSProperties = { display: "inline-flex", color: "white", textDecoration: "none", border: "1px solid #4de8ff", borderRadius: 999, padding: "10px 16px" }
const eyebrow: React.CSSProperties = { marginTop: 28, color: "#74eaff", letterSpacing: ".14em", fontWeight: 900, fontSize: 12 }
const title: React.CSSProperties = { fontSize: "clamp(32px, 6vw, 54px)", margin: "8px 0" }
const subtitle: React.CSSProperties = { color: "#b9c4dc", lineHeight: 1.55, maxWidth: 800 }
const card: React.CSSProperties = { marginTop: 20, padding: 20, border: "1px solid #385b89", borderRadius: 14, background: "#071226" }
const statusCard: React.CSSProperties = { ...card, display: "grid", gap: 9, borderColor: "#4de8ff" }
const empty: React.CSSProperties = { marginTop: 20, padding: 18, border: "1px dashed #76569d", borderRadius: 14, background: "#100d2a", color: "#e9ddff" }
const note: React.CSSProperties = { ...empty, color: "#fde68a" }
const tableWrap: React.CSSProperties = { overflowX: "auto" }
const table: React.CSSProperties = { width: "100%", minWidth: 720, borderCollapse: "collapse", textAlign: "left" }
const disabled: React.CSSProperties = { justifySelf: "start", marginTop: 6, padding: "10px 14px", borderRadius: 9, border: "1px solid #475569", background: "#1e293b", color: "#94a3b8", fontWeight: 800 }
