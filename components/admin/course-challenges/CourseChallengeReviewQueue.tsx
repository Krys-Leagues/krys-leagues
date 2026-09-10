"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

type ReviewEvent = { id: string; action: string; from_status: string | null; to_status: string; reviewer_id: string | null; notes: string | null; created_at: string }
type PastCard = { id: string; challengeKey: "level" | "ace"; level: number; difficulty: string; status: string; proofPhotoUrl: string | null; calculatedTotal: number; relativeToPar: number; createdAt: string }
type Requirement = { requirement?: { label?: string }; status?: string; passed?: boolean | null; reason?: string }
type Submission = {
  id: string; playerId: string; playerName: string; courseSlug: string; courseName: string; challengeKey: "level" | "ace"; level: number; difficulty: "Easy" | "Hard";
  proofPhotoUrl: string | null; holeScores: number[]; pars: number[] | null; calculatedTotal: number; relativeToPar: number; requirements: Requirement[]; status: string;
  reviewReason: string | null; reviewNotes: string | null; roundDate: string | null; roundTime: string | null; gameMode: string | null; adminVerifiedGameMode: string | null;
  enteredFinalScore: number | null; finalScoreCheck: string | null; createdAt: string | null; possibleDuplicate: boolean; pastCards: PastCard[]; reviewEvents: ReviewEvent[];
  allTimeProcessingStatus: string; allTimeProcessingResult: Record<string, unknown> | null;
}

type QueueProps = { includeRejected?: boolean; reviewDesk?: boolean }

export default function CourseChallengeReviewQueue({ includeRejected = false, reviewDesk = false }: QueueProps) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [modes, setModes] = useState<Record<string, "solo" | "multiplayer">>({})
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null)

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/course-challenges${includeRejected ? "?includeRejected=1" : ""}`, { cache: "no-store" })
    const payload = await response.json() as { submissions?: Submission[]; pendingCount?: number; error?: string }
    if (!response.ok) { setMessage(payload.error || "Course Challenge reviews could not be loaded."); setLoading(false); return }
    setSubmissions(payload.submissions || [])
    setPendingCount(payload.pendingCount ?? 0)
    setMessage("")
    setLoading(false)
  }, [includeRejected])

  useEffect(() => {
    let active = true
    const initial = window.setTimeout(() => { if (active) void load() }, 0)
    const timer = window.setInterval(() => { if (active) void load() }, 20_000)
    return () => { active = false; window.clearTimeout(initial); window.clearInterval(timer) }
  }, [load])

  async function review(submission: Submission, action: "approve" | "reject" | "return_to_review") {
    const mode = submission.level <= 2 && submission.challengeKey !== "ace" ? modes[submission.id] : "multiplayer"
    if (action === "approve" && !mode) { setMessage("Select verified Solo or Multiplayer before approving this Level 1 or 2 card."); return }
    setBusyId(submission.id)
    const response = await fetch("/api/admin/course-challenges", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: submission.id, action, gameMode: mode }) })
    const payload = await response.json() as { error?: string; message?: string }
    setMessage(response.ok ? payload.message || "Review saved." : payload.error || "Review failed.")
    setBusyId(null)
    if (response.ok) await load()
  }

  const activeLabel = useMemo(() => reviewDesk ? "Pending reviews" : "Review queue", [reviewDesk])
  return <section style={{ display: "grid", gap: 18 }}>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
      <div><h2 style={{ margin: 0 }}>Course Challenge {reviewDesk ? "Review Desk" : "Review Queue"}</h2><p style={{ color: "#fef3c7", fontWeight: 800 }}>{activeLabel}: {pendingCount}</p></div>
      <span style={{ color: "#94a3b8", fontSize: 13 }}>Refreshes every 20 seconds</span>
    </div>
    {message && <p role="status" style={{ padding: 12, border: "1px solid #f59e0b66", borderRadius: 10, color: "#fde68a", whiteSpace: "pre-line" }}>{message}</p>}
    {loading ? <p>Loading reviews…</p> : submissions.length === 0 ? <p>No {includeRejected ? "Course Challenge cards" : "pending Course Challenge submissions"}.</p> : submissions.map((submission) => <ReviewCard key={submission.id} submission={submission} mode={modes[submission.id]} setMode={(value) => setModes((current) => ({ ...current, [submission.id]: value }))} busy={busyId === submission.id} onReview={review} onPreview={setPreview} />)}
    {preview && <div role="dialog" aria-modal="true" onClick={() => setPreview(null)} style={modalBackdrop}><div onClick={(event) => event.stopPropagation()} style={modalPanel}><button type="button" onClick={() => setPreview(null)} style={closeButton}>Close</button><img src={preview.url} alt={preview.label} style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain" }} /></div></div>}
  </section>
}

function ReviewCard({ submission, mode, setMode, busy, onReview, onPreview }: { submission: Submission; mode?: "solo" | "multiplayer"; setMode: (value: "solo" | "multiplayer") => void; busy: boolean; onReview: (submission: Submission, action: "approve" | "reject" | "return_to_review") => Promise<void>; onPreview: (preview: { url: string; label: string }) => void }) {
  const lockedMode = submission.level >= 3 || submission.challengeKey === "ace"
  return <article style={card}>
    <header style={header}><div><h3 style={{ margin: 0 }}>{submission.playerName} · {submission.courseName}</h3><p style={muted}>{submission.challengeKey === "ace" ? "Ace Challenge" : `Level ${submission.level}`} · {submission.difficulty} · {submission.status.toUpperCase()}</p></div><strong style={{ color: submission.status === "rejected" ? "#fca5a5" : "#fde68a" }}>{submission.status}</strong></header>
    {submission.possibleDuplicate && <p style={warning}>POSSIBLE DUPLICATE CARD — THIS IMAGE WAS PREVIOUSLY SUBMITTED.</p>}
    {submission.proofPhotoUrl && <button type="button" onClick={() => onPreview({ url: submission.proofPhotoUrl || "", label: "Private scorecard evidence" })} style={proofButton}><img src={submission.proofPhotoUrl} alt="Private scorecard evidence thumbnail" style={{ maxWidth: "100%", maxHeight: 340, objectFit: "contain", background: "#020617" }} /><span>Open original private proof</span></button>}
    <p style={muted}>Submitted {submission.createdAt ? new Date(submission.createdAt).toLocaleString() : "—"} · Round date/time: {submission.roundDate || "needs review"} {submission.roundTime || "needs review"}</p>
    <p style={summary}>Player final score: <strong>{formatScore(submission.enteredFinalScore)}</strong> · System relative score: <strong>{formatScore(submission.relativeToPar)}</strong> · Final score check: <strong>{submission.finalScoreCheck || "needs review"}</strong></p>
    <div style={{ overflowX: "auto" }}><table style={table}><thead><tr>{submission.holeScores.map((_, index) => <th key={index} style={cell}>H{index + 1}</th>)}<th style={cell}>Total</th><th style={cell}>To par</th></tr></thead><tbody><tr>{submission.holeScores.map((score, index) => <td key={index} style={cell}>{score}<small style={{ display: "block", color: "#a5b4fc" }}>P{submission.pars?.[index] ?? "—"}</small></td>)}<td style={cell}>{submission.calculatedTotal}</td><td style={cell}>{formatScore(submission.relativeToPar)}</td></tr></tbody></table></div>
    <ul style={{ marginTop: 10 }}>{submission.requirements.map((item, index) => <li key={index}>{item.requirement?.label || "Requirement"}: {item.status || "needs review"}{item.reason ? ` — ${item.reason}` : ""}</li>)}</ul>
    {submission.reviewReason && <p style={reviewReason}>Review reason: {submission.reviewReason}</p>}
    <p style={muted}>Stored Game Mode: {submission.gameMode || "not supplied by player"} · Admin verified: {submission.adminVerifiedGameMode || "not verified"}</p>
    <PastCards submission={submission} onPreview={onPreview} />
    {submission.status === "rejected" ? <button type="button" disabled={busy} onClick={() => void onReview(submission, "return_to_review")} style={buttonStyle("#92400e")}>RETURN TO REVIEW</button> : <div style={{ display: "grid", gap: 10 }}>
      {!lockedMode ? <fieldset style={modeFieldset}><legend>Verified Game Mode</legend><label><input type="radio" name={`mode-${submission.id}`} checked={mode === "solo"} onChange={() => setMode("solo")} /> SOLO</label><label><input type="radio" name={`mode-${submission.id}`} checked={mode === "multiplayer"} onChange={() => setMode("multiplayer")} /> MULTIPLAYER</label></fieldset> : <p style={modeNote}>MULTIPLAYER proof required for Level 3–5 and Ace Challenge.</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}><button type="button" disabled={busy || (submission.level <= 2 && !mode)} onClick={() => void onReview(submission, "approve")} style={buttonStyle("#047857")}>APPROVE</button><button type="button" disabled={busy} onClick={() => void onReview(submission, "reject")} style={buttonStyle("#991b1b")}>REJECT</button></div>
    </div>}
    {submission.allTimeProcessingStatus === "processed" && submission.allTimeProcessingResult && <p style={result}>All-Time/Climbers processed: {String(submission.allTimeProcessingResult.classification || submission.allTimeProcessingResult.action || "complete")}</p>}
  </article>
}

function PastCards({ submission, onPreview }: { submission: Submission; onPreview: (preview: { url: string; label: string }) => void }) {
  return <details style={pastCards}><summary>PAST CARDS ({submission.pastCards.length})</summary>{submission.pastCards.length === 0 ? <p style={muted}>No previous card for this player and course.</p> : <div style={pastGrid}>{submission.pastCards.map((card) => <div key={card.id} style={pastCard}>{card.proofPhotoUrl ? <button type="button" onClick={() => onPreview({ url: card.proofPhotoUrl || "", label: "Private past scorecard evidence" })} style={thumbButton}><img src={card.proofPhotoUrl} alt="Private past scorecard thumbnail" style={thumbnail} /></button> : <span style={thumbnailPlaceholder}>No proof</span>}<strong>{card.challengeKey === "ace" ? "Ace" : `L${card.level}`} · {card.difficulty}</strong><span>{card.status} · {formatScore(card.relativeToPar)}</span><small>{new Date(card.createdAt).toLocaleString()}</small></div>)}</div>}</details>
}

function formatScore(value: number | null | undefined) { if (value === null || value === undefined) return "—"; return value > 0 ? `+${value}` : String(value) }
function buttonStyle(background: string): React.CSSProperties { return { border: 0, borderRadius: 9, padding: "10px 14px", background, color: "white", fontWeight: 800, cursor: "pointer" } }

const card: React.CSSProperties = { border: "1px solid #334155", borderRadius: 16, padding: 18, background: "#0f172a", display: "grid", gap: 10 }
const header: React.CSSProperties = { display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 10 }
const muted: React.CSSProperties = { color: "#cbd5e1", margin: 0 }
const summary: React.CSSProperties = { color: "#e2e8f0", margin: 0 }
const reviewReason: React.CSSProperties = { color: "#fde68a", margin: 0 }
const warning: React.CSSProperties = { color: "#fecaca", background: "#7f1d1d", border: "1px solid #ef4444", borderRadius: 8, padding: 10, fontWeight: 800, margin: 0 }
const result: React.CSSProperties = { color: "#86efac", border: "1px solid #166534", borderRadius: 8, padding: 10, margin: 0 }
const proofButton: React.CSSProperties = { display: "grid", gap: 5, justifyItems: "start", border: "1px solid #475569", borderRadius: 10, padding: 8, background: "#020617", color: "#c4b5fd", cursor: "pointer" }
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse" }
const cell: React.CSSProperties = { padding: 6, textAlign: "center", whiteSpace: "nowrap" }
const modeFieldset: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 14, border: "1px solid #475569", borderRadius: 10, padding: 10 }
const modeNote: React.CSSProperties = { color: "#fef3c7", margin: 0 }
const pastCards: React.CSSProperties = { borderTop: "1px solid #334155", paddingTop: 10 }
const pastGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginTop: 10 }
const pastCard: React.CSSProperties = { display: "grid", gap: 4, border: "1px solid #475569", borderRadius: 8, padding: 8, color: "#e2e8f0", fontSize: 12 }
const thumbButton: React.CSSProperties = { border: 0, padding: 0, background: "transparent", cursor: "pointer" }
const thumbnail: React.CSSProperties = { width: "100%", height: 90, objectFit: "cover", borderRadius: 5 }
const thumbnailPlaceholder: React.CSSProperties = { height: 90, display: "grid", placeItems: "center", background: "#1e293b", borderRadius: 5, color: "#94a3b8" }
const modalBackdrop: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center", padding: 24, background: "#000c" }
const modalPanel: React.CSSProperties = { position: "relative", maxWidth: "min(1000px, 100%)", maxHeight: "90vh", padding: 36, borderRadius: 14, background: "#0f172a" }
const closeButton: React.CSSProperties = { position: "absolute", top: 8, right: 8, border: "1px solid #64748b", borderRadius: 7, padding: "5px 9px", background: "#1e293b", color: "white", cursor: "pointer" }
