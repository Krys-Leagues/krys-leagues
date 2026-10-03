"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { majorAdminRouteContext, majorAdminWorkspaceHref } from "@/lib/majorAdminSelection"
import type { MastersLiveStats, MastersLiveStatRow } from "@/lib/mastersLiveStats"

const emptyStats: MastersLiveStats = { aces: [], eagles: [], birdies: [], pars: [], bogeyFree: [] }
const sections: { key: keyof MastersLiveStats; label: string; suffix: string }[] = [
  { key: "aces", label: "MOST ACES", suffix: "aces" }, { key: "eagles", label: "MOST EAGLES", suffix: "eagles" },
  { key: "birdies", label: "MOST BIRDIES", suffix: "birdies" }, { key: "pars", label: "MOST PARS", suffix: "pars" },
  { key: "bogeyFree", label: "BOGEY-FREE", suffix: "verified bogey-free holes" },
]

export default function MastersStatsPage() {
  const [eventId] = useState(() => typeof window === "undefined" ? "" : majorAdminRouteContext(window.location.search).eventId ?? "")
  const [eventName, setEventName] = useState("Masters")
  const [stats, setStats] = useState(emptyStats)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const response = await fetch(`/api/admin/majors/live-stats${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ""}`, { cache: "no-store" })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? "Unable to load Masters stats")
      setEventName(payload.event?.name ?? "Masters"); setStats(payload.stats ?? emptyStats)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load Masters stats") } finally { setLoading(false) }
  }, [eventId])
  useEffect(() => { queueMicrotask(() => void load()) }, [load])
  return <main style={main}>
    <div style={header}><div><p style={eyebrow}>ADMIN · MASTERS</p><h1 style={{ margin: 0 }}>{eventName} Live Top 3 Stats</h1><p style={muted}>Verified hole scores only. Refreshes when opened or when requested.</p></div><div style={actions}><button type="button" onClick={() => void load()} disabled={loading} style={button}>{loading ? "REFRESHING..." : "REFRESH STATS"}</button><Link href={eventId ? majorAdminWorkspaceHref(eventId) : "/admin/majors"} style={link}>Back to Masters admin</Link></div></div>
    {error && <p role="alert" style={errorStyle}>{error}</p>}
    {loading && !error && <p style={muted}>Loading verified Masters stats...</p>}
    <div style={grid}>{sections.map((section) => <section key={section.key} style={panel}><h2 style={sectionTitle}>{section.label}</h2>{stats[section.key].length ? stats[section.key].map((row: MastersLiveStatRow) => <div key={`${row.playerId}-${row.rank}`} style={rowStyle}><span style={rank}>#{row.rank}</span><span style={name}>{row.name}</span><strong>{section.key === "bogeyFree" ? row.verifiedHoles : row.count} <small style={muted}>{section.suffix}</small></strong></div>) : <p style={muted}>No verified results yet.</p>}</section>)}</div>
  </main>
}

const main: React.CSSProperties = { minHeight: "100vh", padding: "32px clamp(16px, 4vw, 56px)", background: "#09090b", color: "#fafafa" }
const header: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap", alignItems: "end", maxWidth: 1200, margin: "0 auto 28px" }
const actions: React.CSSProperties = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }
const eyebrow: React.CSSProperties = { color: "#93c5fd", fontSize: 12, letterSpacing: 1.5, margin: "0 0 8px" }
const muted: React.CSSProperties = { color: "#a1a1aa" }
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16, maxWidth: 1200, margin: "0 auto" }
const panel: React.CSSProperties = { padding: 20, border: "1px solid #27272a", borderRadius: 16, background: "#111113" }
const sectionTitle: React.CSSProperties = { marginTop: 0, fontSize: 16, letterSpacing: 1 }
const rowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "38px 1fr auto", gap: 10, alignItems: "center", padding: "11px 0", borderTop: "1px solid #27272a" }
const rank: React.CSSProperties = { color: "#93c5fd" }
const name: React.CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
const button: React.CSSProperties = { border: "1px solid #60a5fa", borderRadius: 9, padding: "10px 13px", background: "#172554", color: "white", cursor: "pointer" }
const link: React.CSSProperties = { color: "#bfdbfe", textDecoration: "none", padding: "10px 0" }
const errorStyle: React.CSSProperties = { maxWidth: 1200, margin: "0 auto 20px", padding: 12, borderRadius: 10, background: "#450a0a", color: "#fecaca" }
