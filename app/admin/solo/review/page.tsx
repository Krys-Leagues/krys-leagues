"use client"
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react"
import { groupSoloSubmissionsByDay, soloTrackLabel } from "@/lib/soloAdminReview"

type Row = {
  id: string
  player_screen_name: string
  difficulty: "easy" | "hard"
  submission_intent: string
  stroke_score: number | null
  hn1_count: number
  status: "provisional" | "verified" | "rejected" | "superseded_for_score" | "superseded_for_hn1"
  submitted_at: string
  reviewed_at: string | null
  rejection_reason: string | null
  original_filename: string
  evidence_url: string | null
  affects_score: boolean
  affects_hn1: boolean
  week: { week_number: number; course_name: string | null; course_code: string | null; status: "open" | "closed"; due_date: string | null } | null
}

type ManualContext = {
  seasons: { id: string; season_number: number; is_active: boolean }[]
  selected_season_id?: string
  weeks: { id: string; week_number: number; course_name: string | null; course_code: string | null; status: "open" | "closed"; due_date: string | null }[]
  players: { player_id: string; player_screen_name: string; division: string; display_order: number }[]
}

const statusOptions = [
  ["provisional", "Needs review"],
  ["all", "All cards"],
  ["verified", "Verified"],
  ["rejected", "Rejected"],
] as const

export default function SoloReviewPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [statusFilter, setStatusFilter] = useState("provisional")
  const [dayFilter, setDayFilter] = useState("all")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())

  const load = useCallback(async (nextStatus: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/solo/review?status=${encodeURIComponent(nextStatus)}`, { cache: "no-store" })
      const body = await response.json() as { submissions?: Row[]; error?: string }
      if (!response.ok) throw new Error(body.error || "Review queue unavailable")
      setRows(body.submissions || [])
      setMessage("")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review queue unavailable")
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load("provisional") }, [load])
  const groups = useMemo(() => groupSoloSubmissionsByDay(rows), [rows])
  const visibleGroups = dayFilter === "all" ? groups : groups.filter((group) => group.day === dayFilter)

  async function decide(row: Row, decision: "verified" | "rejected") {
    const reason = decision === "rejected" ? window.prompt("Reason for rejection") : null
    if (decision === "rejected" && reason === null) return
    setBusyIds((current) => new Set(current).add(row.id))
    try {
      const response = await fetch("/api/admin/solo/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ submissionId: row.id, decision, reason }) })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Review failed.")
      setMessage(`Submission ${decision}.`)
      await load(statusFilter)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review failed.")
    } finally {
      setBusyIds((current) => { const next = new Set(current); next.delete(row.id); return next })
    }
  }

  return <main style={shell}>
    <header style={header}>
      <div><h1 style={{ margin: 0 }}>Solo Verification Queue</h1><p style={muted}>Review one player card at a time. The submitted score is never retyped here.</p></div>
      <div style={filters}>
        <label>Status<select value={statusFilter} onChange={(event) => { const next = event.target.value; setStatusFilter(next); setDayFilter("all"); void load(next) }}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Submission day<select value={dayFilter} onChange={(event) => setDayFilter(event.target.value)}><option value="all">All days</option>{groups.map((group) => <option key={group.day} value={group.day}>{formatDay(group.day)}</option>)}</select></label>
      </div>
    </header>
    {message && <p role="status" style={notice}>{message}</p>}
    <ManualOverride />
    {loading ? <p>Loading review queue…</p> : visibleGroups.length === 0 ? <p>No Solo cards match this filter.</p> : visibleGroups.map((group) => <section key={group.day} style={daySection}>
      <div style={dayHeader}><div><h2 style={{ margin: 0 }}>{formatDay(group.day)}</h2><p style={muted}>{group.total} SUBMISSIONS · {group.verified} VERIFIED · {group.needReview} NEED REVIEW</p></div><strong>{group.day === todayKey() ? "TODAY" : ""}</strong></div>
      <div style={list}>{group.submissions.map((row) => <ReviewCard key={row.id} row={row} busy={busyIds.has(row.id)} onDecision={decide} />)}</div>
    </section>)}
  </main>
}

function ReviewCard({ row, busy, onDecision }: { row: Row; busy: boolean; onDecision: (row: Row, decision: "verified" | "rejected") => Promise<void> }) {
  const [zoom, setZoom] = useState(1)
  const reviewable = row.status === "provisional" || row.status.startsWith("superseded_")
  const weekState = row.week?.status === "closed" ? "CLOSED" : row.week?.due_date && row.week.due_date < todayKey() ? "ENDED — AWAITING FINALIZATION" : "LIVE"
  return <article style={card}>
    <div style={cardHeader}><div><h3 style={{ margin: 0 }}>{row.player_screen_name}</h3><p style={muted}>{formatDateTime(row.submitted_at)} · Week {row.week?.week_number ?? "—"} · {row.week?.course_name || "Course not set"}{row.week?.course_code ? ` · ${row.week.course_code}` : ""}</p></div><span style={statusBadge(row.status)}>{row.status.toUpperCase()}</span></div>
    <div style={facts}><span><b>{row.difficulty.toUpperCase()}</b></span><span>Score: <b>{row.stroke_score ?? "HN1 only"}</b></span><span>HN1 / ACES: <b>{row.hn1_count}</b></span><span>Intent: {row.submission_intent.toUpperCase()}</span><span>Week: {weekState}</span><span>TRACK EFFECT: <b>{soloTrackLabel(row.affects_score, row.affects_hn1)}</b></span></div>
    {row.rejection_reason && <p style={warning}>Rejected: {row.rejection_reason}</p>}
    {row.evidence_url ? <div style={evidence}><div style={evidenceTools}><strong>PRIVATE SCORECARD · {row.original_filename}</strong><span><button type="button" onClick={() => setZoom((value) => Math.max(1, value - .5))} disabled={zoom === 1}>−</button><button type="button" onClick={() => setZoom(1)}>RESET</button><button type="button" onClick={() => setZoom((value) => Math.min(3, value + .5))} disabled={zoom === 3}>+</button><span aria-live="polite">{Math.round(zoom * 100)}%</span></span></div><div style={imageViewport}><img src={row.evidence_url} alt={`${row.player_screen_name} ${row.difficulty} scorecard`} style={{ display: "block", width: `${zoom * 100}%`, minWidth: zoom > 1 ? `${zoom * 100}%` : "100%", maxWidth: "none" }} /></div><small style={muted}>Scroll inside the card to pan while zoomed.</small></div> : <p style={warning}>Private scorecard image unavailable.</p>}
    {reviewable && <div style={actions}><button type="button" disabled={busy} onClick={() => void onDecision(row, "verified")}>{busy ? "SAVING…" : "VERIFY"}</button><button type="button" disabled={busy} onClick={() => void onDecision(row, "rejected")}>REJECT</button></div>}
  </article>
}

function ManualOverride() {
  const [context, setContext] = useState<ManualContext | null>(null)
  const [seasonId, setSeasonId] = useState("")
  const [weekId, setWeekId] = useState("")
  const [playerId, setPlayerId] = useState("")
  const [difficulty, setDifficulty] = useState("easy")
  const [mode, setMode] = useState("both")
  const [score, setScore] = useState("")
  const [hn1, setHn1] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (nextSeasonId?: string) => {
    const response = await fetch(`/api/admin/solo/manual${nextSeasonId ? `?seasonId=${encodeURIComponent(nextSeasonId)}` : ""}`, { cache: "no-store" })
    const body = await response.json() as ManualContext & { error?: string }
    if (!response.ok) throw new Error(body.error || "Manual entry unavailable")
    setContext(body)
    const selected = nextSeasonId || body.selected_season_id || ""
    setSeasonId(selected)
    setWeekId(body.weeks[0]?.id || "")
    setPlayerId(body.players[0]?.player_id || "")
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "Manual entry unavailable")) }, [load])
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!context || !file) { setMessage("Select a private scorecard image before saving."); return }
    setBusy(true); setMessage("")
    const form = new FormData()
    form.set("seasonId", seasonId); form.set("weekId", weekId); form.set("playerId", playerId); form.set("difficulty", difficulty); form.set("file", file)
    if (mode !== "hn1") form.set("score", score)
    if (mode !== "score") form.set("hn1", hn1)
    try {
      const response = await fetch("/api/admin/solo/manual", { method: "POST", body: form })
      const body = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(body.error || "Manual card save failed")
      setMessage(body.message || "Admin override saved."); setScore(""); setHn1(""); setFile(null)
      await load(seasonId)
    } catch (error) { setMessage(error instanceof Error ? error.message : "Manual card save failed") } finally { setBusy(false) }
  }
  return <details style={override}><summary style={overrideSummary}>ADMIN OVERRIDE / MANUAL CARD ENTRY</summary><p style={muted}>Exception workflow only. This saves a private evidence-backed verified submission through the same Solo live-result layer used by player cards.</p>{context && <form onSubmit={submit} style={manualGrid}><label>Solo season<select value={seasonId} onChange={(event) => { setSeasonId(event.target.value); void load(event.target.value) }}>{context.seasons.map((season) => <option key={season.id} value={season.id}>Season {season.season_number}{season.is_active ? " · Active" : ""}</option>)}</select></label><label>Open week<select value={weekId} onChange={(event) => setWeekId(event.target.value)}>{context.weeks.map((week) => <option key={week.id} value={week.id}>Week {week.week_number} · {week.course_name || "Course not set"}</option>)}</select></label><label>Player<select value={playerId} onChange={(event) => setPlayerId(event.target.value)}>{context.players.map((player) => <option key={player.player_id} value={player.player_id}>{player.player_screen_name} · {player.division}</option>)}</select></label><label>Difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="easy">EASY</option><option value="hard">HARD</option></select></label><label>Entry type<select value={mode} onChange={(event) => setMode(event.target.value)}><option value="both">SCORE + HN1</option><option value="score">SCORE ONLY</option><option value="hn1">HN1 ONLY</option></select></label><label>Score<input type="number" value={score} onChange={(event) => setScore(event.target.value)} disabled={mode === "hn1"} placeholder={mode === "hn1" ? "Not used" : "e.g. -22"} /></label><label>HN1 / aces<input type="number" min="0" value={hn1} onChange={(event) => setHn1(event.target.value)} disabled={mode === "score"} placeholder={mode === "score" ? "Not used" : "e.g. 7"} /></label><label>Private scorecard<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} required /></label><button type="submit" disabled={busy || !context.weeks.length || !context.players.length}>{busy ? "SAVING…" : "SAVE VERIFIED OVERRIDE"}</button></form>}{message && <p role="status" style={notice}>{message}</p>}</details>
}

function formatDay(day: string) { if (day === "unknown") return "UNKNOWN DATE"; return new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`)).toUpperCase() }
function formatDateTime(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) }
function todayKey() { return new Date().toISOString().slice(0, 10) }
function statusBadge(status: string): React.CSSProperties { return { padding: "5px 9px", borderRadius: 99, background: status === "verified" ? "#14532d" : status === "rejected" ? "#7f1d1d" : "#854d0e", fontWeight: 900, fontSize: 12 } }
const shell: React.CSSProperties = { minHeight: "100vh", padding: 24, color: "#f8fafc", background: "#020617", maxWidth: 1200, margin: "0 auto" }
const header: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 18, alignItems: "end", flexWrap: "wrap", borderBottom: "1px solid #334155", paddingBottom: 18 }
const filters: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap" }
const muted: React.CSSProperties = { color: "#cbd5e1", margin: "6px 0" }
const notice: React.CSSProperties = { padding: 12, borderRadius: 8, background: "#172554", color: "#bfdbfe" }
const warning: React.CSSProperties = { padding: 10, borderRadius: 8, background: "#451a03", color: "#fed7aa" }
const daySection: React.CSSProperties = { marginTop: 26 }
const dayHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #475569", paddingBottom: 8 }
const list: React.CSSProperties = { display: "grid", gap: 16, marginTop: 14 }
const card: React.CSSProperties = { display: "grid", gap: 14, padding: 18, borderRadius: 14, background: "#0f172a", border: "1px solid #334155" }
const cardHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }
const facts: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 }
const evidence: React.CSSProperties = { display: "grid", gap: 8, padding: 12, borderRadius: 10, background: "#020617", border: "1px solid #475569" }
const evidenceTools: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }
const imageViewport: React.CSSProperties = { overflow: "auto", maxHeight: 460, borderRadius: 8, background: "#111827" }
const actions: React.CSSProperties = { display: "flex", gap: 10 }
const override: React.CSSProperties = { marginTop: 22, padding: 16, border: "1px solid #64748b", borderRadius: 12, background: "#111827" }
const overrideSummary: React.CSSProperties = { cursor: "pointer", fontWeight: 900, color: "#fbbf24" }
const manualGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, alignItems: "end" }
