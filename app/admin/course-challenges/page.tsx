"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

type Submission = { id: string; playerId: string; playerName: string; courseSlug: string; courseName: string; challengeKey: "level" | "ace"; level: number; difficulty: "Easy" | "Hard"; proofPhotoUrl: string | null; holeScores: number[]; pars: number[] | null; calculatedTotal: number; relativeToPar: number; requirements: Array<{ requirement?: { label?: string }; status: string; passed: boolean | null; reason?: string }>; status: string; reviewReason: string | null; roundDate: string | null; roundTime: string | null; gameMode: string | null; enteredFinalScore: number | null; finalScoreCheck: string | null; createdAt: string | null }

export default function CourseChallengesAdminPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  async function load() {
    setLoading(true)
    const response = await fetch("/api/admin/course-challenges", { cache: "no-store" })
    const payload = await response.json() as { submissions?: Submission[]; pendingCount?: number; error?: string }
    setSubmissions(payload.submissions || [])
    setPendingCount(payload.pendingCount ?? payload.submissions?.length ?? 0)
    setMessage(response.ok ? "" : payload.error || "Course Challenge reviews could not be loaded.")
    setLoading(false)
  }

  useEffect(() => { const timer = window.setTimeout(() => { void load() }, 0); return () => window.clearTimeout(timer) }, [])

  async function review(id: string, action: "approve" | "reject") {
    const response = await fetch("/api/admin/course-challenges", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) })
    const payload = await response.json() as { error?: string; message?: string }
    setMessage(response.ok ? payload.message || "Review saved." : payload.error || "Review failed.")
    if (response.ok) await load()
  }

  return <main style={{ minHeight: "100vh", padding: 28, background: "#020617", color: "#f8fafc" }}>
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <Link href="/admin" style={{ color: "#c4b5fd" }}>← Admin</Link>
      <h1>Course Challenge Review Queue</h1>
      <p style={{ color: "#fef3c7", fontWeight: 800 }}>Pending submissions: {pendingCount}</p><p style={{ color: "#cbd5e1" }}>Approve only after checking the player, course, difficulty, Level, photo, entered H1–H18, authoritative pars, calculated total, and every requirement. Public viewers never receive proof photos or review details.</p>
      {message && <p role="status" style={{ padding: 12, border: "1px solid #f59e0b66", borderRadius: 10, color: "#fde68a" }}>{message}</p>}
      {loading ? <p>Loading reviews…</p> : submissions.length === 0 ? <p>No pending Course Challenge submissions.</p> : <div style={{ display: "grid", gap: 18 }}>{submissions.map((submission) => <article key={submission.id} style={{ border: "1px solid #334155", borderRadius: 16, padding: 18, background: "#0f172a" }}>
        <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 10 }}><div><h2 style={{ margin: 0 }}>{submission.playerName} · {submission.courseName}</h2><p style={{ color: "#cbd5e1" }}>{submission.challengeKey === "ace" ? "Ace Challenge" : "Level " + submission.level} · {submission.difficulty} · {submission.roundDate || "date needs review"} {submission.roundTime || "time needs review"} · {submission.gameMode || "Game Mode needs review"}</p></div><strong>{submission.status}</strong></header>
        {submission.proofPhotoUrl && <img src={submission.proofPhotoUrl} alt="Private scorecard evidence" style={{ maxWidth: "100%", maxHeight: 360, objectFit: "contain", display: "block", margin: "12px 0", background: "#020617" }} />}
        <p style={{ color: "#cbd5e1" }}>Player final score: <strong>{submission.enteredFinalScore === null ? "—" : (submission.enteredFinalScore > 0 ? `+${submission.enteredFinalScore}` : submission.enteredFinalScore)}</strong> · System relative score: <strong>{submission.relativeToPar > 0 ? `+${submission.relativeToPar}` : submission.relativeToPar}</strong> · Final score check: <strong>{submission.finalScoreCheck || "needs review"}</strong></p><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{submission.holeScores.map((_, index) => <th key={index} style={{ padding: 6, color: "#94a3b8" }}>H{index + 1}</th>)}<th>Total</th><th>To par</th></tr></thead><tbody><tr>{submission.holeScores.map((score, index) => <td key={index} style={{ padding: 6, textAlign: "center" }}>{score}<small style={{ display: "block", color: "#a5b4fc" }}>P{submission.pars?.[index] ?? "—"}</small></td>)}<td style={{ textAlign: "center" }}>{submission.calculatedTotal}</td><td style={{ textAlign: "center" }}>{submission.relativeToPar > 0 ? `+${submission.relativeToPar}` : submission.relativeToPar}</td></tr></tbody></table></div>
        <ul>{submission.requirements.map((item, index) => <li key={index}>{item.requirement?.label || "Requirement"}: {item.status}{item.reason ? ` — ${item.reason}` : ""}</li>)}</ul>{submission.reviewReason && <p style={{ color: "#fde68a" }}>Review reason: {submission.reviewReason}</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}><button type="button" onClick={() => void review(submission.id, "approve")} style={buttonStyle("#047857")}>Approve</button><button type="button" onClick={() => void review(submission.id, "reject")} style={buttonStyle("#991b1b")}>Reject</button></div>
      </article>)}</div>}
    </div>
  </main>
}

function buttonStyle(background: string): React.CSSProperties { return { border: 0, borderRadius: 9, padding: "10px 14px", background, color: "white", fontWeight: 800, cursor: "pointer" } }
