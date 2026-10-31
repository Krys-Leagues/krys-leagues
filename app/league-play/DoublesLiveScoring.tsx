"use client"

import { useEffect, useState } from "react"

type LivePayload = { groups?: Array<{ division: string; fixtures: Array<{ id: string; game_number: number; home_team_name_snapshot: string; away_team_name_snapshot: string; home_course: string; away_course: string; state: string; result?: { home_holes_won: number; away_holes_won: number } | null }> }> }

export default function DoublesLiveScoring() {
  const [payload, setPayload] = useState<LivePayload | null>(null)
  const [message, setMessage] = useState("")
  useEffect(() => { fetch("/api/doubles/live", { cache: "no-store" }).then(async (response) => { const data = await response.json() as LivePayload & { error?: string }; if (!response.ok) throw new Error(data.error || "Live scoring unavailable"); setPayload(data) }).catch((error) => setMessage(error instanceof Error ? error.message : "Live scoring unavailable")) }, [])
  if (message) return <section style={panel}><h2>Doubles Live Scoring</h2><p>{message}</p></section>
  if (!payload) return <section style={panel}><h2>Doubles Live Scoring</h2><p>Loading current fixtures…</p></section>
  return <section style={panel} aria-label="Doubles live scoring"><p style={eyebrow}>DOUBLES MATCH PLAY</p><h2>Live scoring</h2><p style={muted}>Read-only public view. Private scorecard photos are never shown here.</p>{(payload.groups || []).length === 0 ? <p>No published Doubles fixtures are available.</p> : (payload.groups || []).map((group) => <div key={group.division} style={groupStyle}><h3>{group.division}</h3>{group.fixtures.map((fixture) => <article key={fixture.id} style={fixtureStyle}><div><strong>GAME {fixture.game_number}</strong><div>{fixture.home_team_name_snapshot} <span style={muted}>vs</span> {fixture.away_team_name_snapshot}</div><small>{fixture.home_course} · {fixture.away_course}</small></div><div style={statusStyle}><strong>{fixture.result ? `${fixture.result.home_holes_won}–${fixture.result.away_holes_won}` : fixture.state.replaceAll("_", " ")}</strong><span>{fixture.result ? "VERIFIED" : fixture.state.replaceAll("_", " ")}</span></div></article>)}</div>)}</section>
}

const panel = { maxWidth: 980, margin: "24px auto", padding: 24, borderRadius: 18, background: "rgba(15,23,42,.86)", color: "#f8fafc", border: "1px solid rgba(148,163,184,.25)" }
const groupStyle = { marginTop: 20, paddingTop: 12, borderTop: "1px solid rgba(148,163,184,.22)" }
const fixtureStyle = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", padding: 14, marginTop: 10, borderRadius: 12, background: "rgba(30,41,59,.85)" }
const statusStyle = { textAlign: "right" as const, display: "grid", gap: 4, textTransform: "uppercase" as const, fontSize: 12 }
const eyebrow = { letterSpacing: ".12em", fontSize: 12, color: "#93c5fd" }
const muted = { color: "#cbd5e1" }
