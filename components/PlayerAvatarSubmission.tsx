"use client"

import { useRef, useState } from "react"

type Submission = { status: "UPLOADING" | "PENDING" | "APPROVED" | "REJECTED"; original_filename?: string | null; submitted_at?: string | null; review_note?: string | null }

export default function PlayerAvatarSubmission({ playerId }: { playerId: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  async function loadStatus() {
    const response = await fetch(`/api/players/${encodeURIComponent(playerId)}/avatar-submission`, { credentials: "same-origin", cache: "no-store" })
    const payload = await response.json().catch(() => ({})) as { submission?: Submission | null; error?: string }
    if (!response.ok) { setMessage(payload.error || "Avatar submissions are unavailable."); return }
    setSubmission(payload.submission || null)
    setMessage("")
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) void loadStatus()
  }

  async function submit(file: File | undefined) {
    if (!file) return
    setBusy(true); setMessage("")
    const form = new FormData(); form.set("file", file)
    const response = await fetch(`/api/players/${encodeURIComponent(playerId)}/avatar-submission`, { method: "POST", body: form, credentials: "same-origin" })
    const payload = await response.json().catch(() => ({})) as { status?: Submission["status"]; error?: string }
    setBusy(false)
    if (!response.ok) { setMessage(payload.error || "Avatar submission failed."); return }
    setSubmission({ status: payload.status || "PENDING", original_filename: file.name })
    setMessage("Avatar submitted for admin review. Your current avatar stays in place until approval.")
  }

  return <section aria-label="Avatar submission" style={{ display: "grid", gap: 8, justifyItems: "start" }}>
    <button type="button" onClick={toggle} aria-expanded={open} style={{ padding: "8px 14px", border: "1px solid #ffffff38", borderRadius: 10, background: "#0206172e", color: "white", font: "inherit", fontWeight: 700, lineHeight: 1.25, cursor: "pointer" }}>SUBMIT AVATAR</button>
    {open && <div style={{ display: "grid", gap: 8, maxWidth: 430, padding: 12, border: "1px solid #ffffff2e", borderRadius: 10, background: "#06132599", backdropFilter: "blur(7px)" }}>
      <strong>Send an avatar for admin review</strong>
      <small>JPEG, PNG, WebP, or GIF · 5 MB maximum. Your current avatar is not changed until approval.</small>
      {submission && <span role="status">Status: {submission.status}</span>}
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} style={{ justifySelf: "start", padding: "8px 12px", border: "1px solid #2cf6e1", borderRadius: 8, background: "#033a3b75", color: "#f8fafc", cursor: busy ? "wait" : "pointer" }}>{busy ? "SUBMITTING…" : "CHOOSE IMAGE"}</button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden disabled={busy} onChange={event => { void submit(event.target.files?.[0]); event.currentTarget.value = "" }} />
      {message && <small role="status">{message}</small>}
    </div>}
  </section>
}
