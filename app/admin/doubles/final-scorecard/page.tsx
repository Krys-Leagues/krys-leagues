"use client"

import { useState } from "react"

export default function DoublesFinalScorecardPage() {
  const [seasonId, setSeasonId] = useState("")
  const [scorecard, setScorecard] = useState<{ id?: string; status?: string; payload?: unknown } | null>(null)
  const [message, setMessage] = useState("")

  async function act(action: "generate" | "approve" | "finalize") {
    const body = action === "approve" ? { action, scorecard_id: scorecard?.id } : { action, season_id: seasonId }
    const response = await fetch("/api/admin/doubles/final-scorecard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const result = await response.json() as { scorecard?: typeof scorecard; snapshots_created?: number; error?: string }
    if (!response.ok) { setMessage(result.error || "Final Scorecard action failed"); return }
    if (result.scorecard) setScorecard(result.scorecard)
    setMessage(action === "generate" ? "Doubles Final Scorecard generated" : action === "approve" ? "Doubles Final Scorecard approved" : `Finalized ${result.snapshots_created ?? 0} division snapshot(s)`)
  }

  return <main style={{ padding: 24, background: "black", color: "white", minHeight: "100vh" }}>
    <h1>Doubles Final Scorecard</h1>
    <p style={{ color: "#aaa" }}>Team standings are the competition authority. Walkabout evidence is not this final league scorecard.</p>
    <input style={input} placeholder="Managed Doubles season ID" value={seasonId} onChange={(event) => setSeasonId(event.target.value)} />
    <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
      <button style={button} onClick={() => void act("generate")} disabled={!seasonId}>Generate</button>
      <button style={button} onClick={() => void act("approve")} disabled={!scorecard?.id || scorecard.status !== "draft"}>Approve</button>
      <button style={button} onClick={() => void act("finalize")} disabled={!seasonId || scorecard?.status !== "approved"}>Finalize season</button>
    </div>
    {scorecard && <pre style={{ marginTop: 20, whiteSpace: "pre-wrap", background: "#111", padding: 16 }}>{JSON.stringify(scorecard, null, 2)}</pre>}
    {message && <p style={{ color: "#fbbf24" }}>{message}</p>}
  </main>
}

const input = { padding: 10, width: 420, maxWidth: "100%", background: "#111", color: "white", border: "1px solid #444" }
const button = { padding: "10px 14px", background: "#1e293b", color: "white", border: "1px solid #64748b", borderRadius: 6 }
