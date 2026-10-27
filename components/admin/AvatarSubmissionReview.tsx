"use client"

import { useEffect, useState } from "react"
import Image from "next/image"

type Row = { id: string; player_id: string; screen_name: string; original_filename: string; content_type: string; file_size_bytes: number; status: string; submitted_at: string; preview_url: string | null; review_note: string | null }

export default function AvatarSubmissionReview() {
  const [rows, setRows] = useState<Row[]>([])
  const [message, setMessage] = useState("Loading avatar submissions…")
  const [busy, setBusy] = useState("")

  async function load() {
    const response = await fetch("/api/admin/avatar-submissions", { credentials: "same-origin", cache: "no-store" })
    const payload = await response.json().catch(() => ({})) as { submissions?: Row[]; error?: string }
    if (!response.ok) { setMessage(payload.error || "Avatar submissions could not be loaded."); return }
    setRows(payload.submissions || []); setMessage(payload.submissions?.length ? "" : "No avatar submissions are awaiting review.")
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    setBusy(id); setMessage("")
    const response = await fetch("/api/admin/avatar-submissions", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ submissionId: id, decision }) })
    const payload = await response.json().catch(() => ({})) as { error?: string }
    setBusy("")
    if (!response.ok) { setMessage(payload.error || "Avatar review failed."); return }
    await load()
  }

  return <main style={{ minHeight: "100vh", padding: 24, color: "white", background: "#07111f" }}>
    <h1>Avatar Submissions</h1>
    <p>Private admin review. Approved images replace the current avatar only after this decision.</p>
    {message && <p role="status">{message}</p>}
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
      {rows.map(row => <article key={row.id} style={{ display: "grid", gap: 8, padding: 16, border: "1px solid #ffffff2e", borderRadius: 12, background: "#061325cc" }}>
        <strong>{row.screen_name}</strong><small>{row.original_filename} · {row.content_type} · {Math.round(row.file_size_bytes / 1024)} KB</small>
        {row.preview_url && <Image src={row.preview_url} alt={`${row.screen_name} avatar submission`} width={480} height={280} unoptimized style={{ width: "100%", height: "auto", maxHeight: 280, objectFit: "contain", background: "#020617" }} />}
        <span>Status: {row.status}</span>
        {row.status === "PENDING" && <div style={{ display: "flex", gap: 8 }}><button type="button" disabled={busy === row.id} onClick={() => void decide(row.id, "APPROVED")}>APPROVE</button><button type="button" disabled={busy === row.id} onClick={() => void decide(row.id, "REJECTED")}>REJECT</button></div>}
      </article>)}
    </div>
  </main>
}
