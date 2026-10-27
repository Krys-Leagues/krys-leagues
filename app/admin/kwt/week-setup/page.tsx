"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { KWT_SEASON_15_WEEK_01_SOURCE } from "@/lib/kwtSeason15Week01Verification"

type Setup = { state: "AVAILABLE" | "UNAVAILABLE"; event: { eventIdentifier: string; season: number; week: number; courseName: string; freezeCutoff: string | null } | null; reason: string | null; canPublish: boolean }

export default function KwtWeekSetupPage() {
  const [setup, setSetup] = useState<Setup | null>(null)
  const [error, setError] = useState("")
  useEffect(() => { void fetch("/api/admin/kwt/week-setup", { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(response.status === 403 ? "Course Challenges/KWT administrator authorization is required." : "Setup could not be read."); setSetup(await response.json() as Setup) }).catch((caught) => setError(caught instanceof Error ? caught.message : "Setup could not be read.")) }, [])
  return <main style={page}><div style={shell}><Link href="/admin/kwt" style={back}>← KWT Admin</Link><h1 style={title}>KWT Week Setup</h1><p style={subtitle}>Protected read-only verification of the authoritative weekend setup. No Production records are created or changed by this Preview.</p>{error && <p role="alert" style={empty}>{error}</p>}{!error && !setup && <p style={empty}>Checking the verified KWT schedule…</p>}{setup?.state === "UNAVAILABLE" && <><section style={card}><h2>Verified source event</h2><p>{KWT_SEASON_15_WEEK_01_SOURCE.eventIdentifier} · {KWT_SEASON_15_WEEK_01_SOURCE.courseName} · {KWT_SEASON_15_WEEK_01_SOURCE.easyCourseCode} / {KWT_SEASON_15_WEEK_01_SOURCE.hardCourseCode}</p><p>Official source day: {KWT_SEASON_15_WEEK_01_SOURCE.officialDate} · identity ledger: {KWT_SEASON_15_WEEK_01_SOURCE.identitySourceStatus}</p><p>Owner-confirmed freeze: {KWT_SEASON_15_WEEK_01_SOURCE.ownerConfirmedHandicapFreezeCutoff} ({KWT_SEASON_15_WEEK_01_SOURCE.ownerConfirmedHandicapFreezeTimezone})</p></section><section style={empty}><strong>No protected Week Setup is configured.</strong><p>The local owner-confirmed freeze is known, but Production still lacks the protected Week Setup record that must persist it. Event dates, slopes, divisions, and activation remain blocked until that approved record exists.</p><button type="button" disabled style={disabled}>PUBLISH WEEK SETUP DISABLED</button></section></>}{setup?.state === "AVAILABLE" && setup.event && <section style={card}><h2>{setup.event.courseName} · {setup.event.eventIdentifier}</h2><p>Season {setup.event.season} · Week {setup.event.week}</p><p>Handicap freeze: {setup.event.freezeCutoff ?? "Not provided"}</p><button type="button" disabled={setup.canPublish === false} style={disabled}>PUBLISH VERIFIED WEEK</button></section>}</div></main>
}
const page: React.CSSProperties = { minHeight: "100vh", padding: 24, background: "#05020d", color: "white" }
const shell: React.CSSProperties = { width: "min(100%, 900px)", margin: "0 auto" }
const back: React.CSSProperties = { display: "inline-flex", color: "white", textDecoration: "none", border: "1px solid #4de8ff", borderRadius: 999, padding: "10px 16px" }
const title: React.CSSProperties = { fontSize: 40, margin: "28px 0 8px" }
const subtitle: React.CSSProperties = { color: "#b9c4dc", lineHeight: 1.5 }
const empty: React.CSSProperties = { marginTop: 20, padding: 18, border: "1px dashed #76569d", borderRadius: 14, background: "#100d2a", color: "#e9ddff", lineHeight: 1.5 }
const card: React.CSSProperties = { marginTop: 20, padding: 20, border: "1px solid #385b89", borderRadius: 14, background: "#071226" }
const disabled: React.CSSProperties = { marginTop: 14, padding: "10px 14px", borderRadius: 9, border: "1px solid #475569", background: "#1e293b", color: "#94a3b8", fontWeight: 800 }

