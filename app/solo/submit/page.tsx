"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

type Dashboard = { eligible: boolean; reason?: string; screenName?: string; season?: { season_number: number }; week?: { week_number: number; course_name: string | null; course_code: string | null }; submissions?: Array<{ id: string; difficulty: string; submission_intent: string; stroke_score: number | null; hn1_count: number; status: string; submitted_at: string }> }

export default function SoloSubmitPage() {
  const [data, setData] = useState<Dashboard | null>(null)
  const [difficulty, setDifficulty] = useState("easy")
  const [intent, setIntent] = useState("score")
  const [score, setScore] = useState("")
  const [hn1, setHn1] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => { void fetch("/api/solo/dashboard", { cache: "no-store" }).then((response) => response.json()).then(setData).catch(() => setMessage("Solo dashboard unavailable.")) }, [])
  async function submit() {
    if (!file) return setMessage("Choose the actual scorecard photo first.")
    setBusy(true); setMessage("")
    const form = new FormData(); form.set("difficulty", difficulty); form.set("intent", intent); form.set("score", score); form.set("hn1", hn1); form.set("file", file)
    try { const response = await fetch("/api/solo/submissions", { method: "POST", body: form }); const body = await response.json() as { error?: string; message?: string }; if (!response.ok) throw new Error(body.error || "Submission failed."); setMessage(body.message || "SOLO CARD SUBMITTED — PROVISIONAL"); setFile(null); setScore(""); setHn1("") } catch (error) { setMessage(error instanceof Error ? error.message : "Submission failed.") } finally { setBusy(false) }
  }
  if (!data) return <main style={shell}><h1>Solo Submission</h1><p>Loading…</p></main>
  if (!data.eligible) return <main style={shell}><h1>Solo Submission</h1><p>You must be an authenticated member of the active Solo roster to submit.</p><Link href="/player-dashboard">Back to Player Dashboard</Link></main>
  return <main style={shell}><Link href="/player-dashboard">← Player Dashboard</Link><header style={header}><p>SOLO · SEASON {data.season?.season_number} · WEEK {data.week?.week_number}</p><h1>{data.screenName}</h1><strong>{data.week?.course_name || "Course not set"} {data.week?.course_code ? `· ${data.week.course_code}` : ""}</strong></header><section style={card}><h2>Submit a Solo card</h2><label>Submission intent<select value={intent} onChange={(event) => setIntent(event.target.value)}><option value="score">SUBMIT SCORE</option><option value="ace">SUBMIT ACE CARD</option></select></label><label>Difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="easy">Easy</option><option value="hard">Hard</option></select></label><label>Score {intent === "ace" && <small>(optional for Ace Card)</small>}<input type="number" value={score} onChange={(event) => setScore(event.target.value)} placeholder="Negative scores are valid" /></label><label>HN1 / Aces<input type="number" min="0" value={hn1} onChange={(event) => setHn1(event.target.value)} /></label><label>Private scorecard photo<input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><button type="button" disabled={busy} onClick={() => void submit()}>{busy ? "SUBMITTING…" : intent === "ace" ? "SUBMIT ACE CARD" : "SUBMIT SCORE"}</button>{message && <p role="status">{message}</p>}</section><section style={card}><h2>Submission history</h2>{data.submissions?.length ? data.submissions.map((item) => <p key={item.id}>{item.difficulty.toUpperCase()} · {item.submission_intent.toUpperCase()} · {item.stroke_score ?? "HN1 only"} · HN1 {item.hn1_count} · <strong>{item.status.toUpperCase()}</strong></p>) : <p>No Solo cards submitted for this week.</p>}</section></main>
}

const shell = { minHeight: "100vh", padding: 24, color: "#f8fafc", background: "#071a20", maxWidth: 900, margin: "0 auto" }
const header = { marginTop: 18, padding: 22, borderRadius: 16, background: "#102d33", border: "1px solid #55bdb7" }
const card = { display: "grid", gap: 12, marginTop: 18, padding: 22, borderRadius: 16, background: "#061014", border: "1px solid #ffffff2e" }
