"use client"

import { useState } from "react"

export default function DoublesReviewPage() {
  const [fixtureId, setFixtureId] = useState("")
  const [queue, setQueue] = useState<{ drafts: Array<Record<string, unknown>>; evidence: Array<Record<string, unknown>> } | null>(null)
  const [message, setMessage] = useState("")
  async function load() { const response = await fetch(`/api/admin/doubles/review?fixture_id=${encodeURIComponent(fixtureId)}`); const data = await response.json(); if (!response.ok) return setMessage(data.error || "Review queue unavailable"); setQueue(data); setMessage("") }
  async function markCorrection() { const response = await fetch("/api/admin/doubles/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_needs_correction", fixture_id: fixtureId }) }); const data = await response.json(); setMessage(response.ok ? "NEEDS CORRECTION applied." : data.error || "Could not update fixture"); if (response.ok) await load() }
  return <main style={shell}><h1>Doubles Verification</h1><p>Review team-owned submissions, private evidence, and authoritative two-course results. Player photos remain private.</p><label>Fixture ID<input value={fixtureId} onChange={(event) => setFixtureId(event.target.value)} /></label><div style={actions}><button type="button" disabled={!fixtureId} onClick={() => void load()}>Load queue</button><button type="button" disabled={!fixtureId} onClick={() => void markCorrection()}>NEEDS CORRECTION</button></div>{message && <p role="status">{message}</p>}{queue && <section style={card}><h2>Queue</h2><p>{queue.drafts.length} team-course drafts · {queue.evidence.length} evidence slots</p>{queue.drafts.map((draft, index) => <pre key={index} style={pre}>{JSON.stringify({ course_slot: draft.course_slot, season_team_id: draft.season_team_id, status: draft.status, home_holes_won: draft.home_holes_won, away_holes_won: draft.away_holes_won }, null, 2)}</pre>)}</section>}</main>
}

const shell = { maxWidth: 900, margin: "40px auto", padding: 24, color: "#f8fafc", background: "#020617", minHeight: "100vh" }
const actions = { display: "flex", gap: 10, marginTop: 16 }
const card = { marginTop: 24, padding: 20, borderRadius: 14, background: "#0f172a" }
const pre = { padding: 12, background: "#111827", overflowX: "auto" as const }
