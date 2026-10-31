"use client"

import { useState } from "react"

type State = { fixture?: { home_team_name_snapshot: string; away_team_name_snapshot: string; home_course: string; away_course: string }; arrangement?: { state: string; accepted_for?: string | null }; error?: string }

export default function DoublesArrangePage() {
  const [fixtureId, setFixtureId] = useState(""); const [timezone, setTimezone] = useState("UTC"); const [windows, setWindows] = useState("540-720"); const [chat, setChat] = useState("")
  const [data, setData] = useState<State | null>(null)
  const [message, setMessage] = useState("")
  async function request(action?: string, extra: Record<string, unknown> = {}) {
    const response = await fetch("/api/doubles/arrange", { method: action ? "POST" : "GET", ...(action ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fixture_id: fixtureId, action, ...extra }) } : {}), ...(action ? {} : { cache: "no-store" }) })
    const body = await response.json() as State
    if (!response.ok) { setMessage(body.error || "Arrange request failed"); return }
    setData(body); setMessage("Saved")
  }
  return <main style={{ padding: 24, background: "#020617", color: "white", minHeight: "100vh" }}>
    <h1>Doubles Arrange</h1><p style={{ color: "#94a3b8" }}>Only the four canonical fixture participants can view or change this state. Availability is intersected across all four players.</p>
    <input style={input} placeholder="Fixture ID" value={fixtureId} onChange={(event) => setFixtureId(event.target.value)} /> <button style={button} disabled={!fixtureId} onClick={() => void request()}>Load</button>
    {data?.fixture && <section style={card}><h2>{data.fixture.home_team_name_snapshot} vs {data.fixture.away_team_name_snapshot}</h2><p>Home course: {data.fixture.home_course}</p><p>Away course: {data.fixture.away_course}</p><p>State: {data.arrangement?.state || "NOT ARRANGED"}</p>{data.arrangement?.accepted_for && <p>Accepted: {new Date(data.arrangement.accepted_for).toLocaleString()}</p>}<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={button} onClick={() => void request("propose", { proposed_for: new Date(Date.now() + 86400000).toISOString() })}>Propose</button><button style={button} onClick={() => void request("counter", { proposed_for: new Date(Date.now() + 172800000).toISOString() })}>Counter</button><button style={button} onClick={() => void request("accept")}>Accept</button></div><hr /><h3>My master availability</h3><input style={input} value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Timezone" /><input style={input} value={windows} onChange={(event) => setWindows(event.target.value)} placeholder="windows, e.g. 540-720" /><button style={button} onClick={() => void request("save_availability", { timezone, windows: windows.split(",").map((value) => { const [startMinute, endMinute] = value.trim().split("-").map(Number); return { startMinute, endMinute } }) })}>Save availability</button><h3>Private fixture chat</h3><input style={input} value={chat} onChange={(event) => setChat(event.target.value)} placeholder="Message the other three players" /><button style={button} onClick={() => void request("message", { message: chat })}>Send</button></section>}
    {message && <p style={{ color: "#fbbf24" }}>{message}</p>}
  </main>
}
const input = { padding: 10, width: 360, maxWidth: "100%", background: "#111827", color: "white", border: "1px solid #475569" }
const button = { padding: "10px 14px", background: "#1e293b", color: "white", border: "1px solid #64748b", borderRadius: 6 }
const card = { marginTop: 20, padding: 20, maxWidth: 640, background: "#0f172a", border: "1px solid #334155", borderRadius: 12 }
