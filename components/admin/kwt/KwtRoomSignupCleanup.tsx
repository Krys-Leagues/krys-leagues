"use client"

import { useState } from "react"

type CleanupResult = {
  status: "success" | "already_clear" | "partial" | "failed"
  deletedCount: number
  failedCount: number
  protected: { pinned: number; humanAdmin: number; unrelatedBot: number; total: number }
}

export default function KwtRoomSignupCleanup() {
  const [confirming, setConfirming] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<CleanupResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function clearSignups() {
    if (processing) return
    setProcessing(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetch("/api/admin/kwt/clear-room-signups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok && response.status !== 207) {
        throw new Error(payload?.error || "KWT cleanup could not be completed.")
      }
      setResult(payload as CleanupResult)
      setConfirming(false)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "KWT cleanup failed safely.")
    } finally {
      setProcessing(false)
    }
  }

  return (
    <section style={dangerCard} aria-labelledby="kwt-cleanup-title">
      <strong id="kwt-cleanup-title" style={{ fontSize: 18 }}>Discord Room Signups</strong>
      <span style={description}>
        Remove only obsolete, unpinned KWT Room Bot signup posts from the protected KWT signup channel.
      </span>
      <button type="button" style={dangerButton} onClick={() => setConfirming(true)}>
        CLEAR KWT ROOM SIGNUPS
      </button>

      {result ? <ResultNotice result={result} /> : null}
      {error ? <p role="alert" style={errorText}>{error} Try again after checking the bot permission.</p> : null}

      {confirming ? (
        <div style={backdrop} role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="kwt-cleanup-confirm-title"
            style={dialog}
          >
            <h2 id="kwt-cleanup-confirm-title" style={{ margin: 0 }}>CLEAR KWT ROOM SIGNUPS?</h2>
            <p style={dialogCopy}>
              This will remove obsolete KWT room/signup bot posts from the KWT signup channel.
            </p>
            <p style={dialogCopy}>It will NOT remove:</p>
            <ul style={protectionList}>
              <li>Pinned messages</li>
              <li>Human or admin messages</li>
              <li>Announcements or instructions</li>
              <li>Unrelated bot messages</li>
            </ul>
            <div style={actions}>
              <button
                type="button"
                style={cancelButton}
                disabled={processing}
                onClick={() => setConfirming(false)}
              >
                CANCEL
              </button>
              <button
                type="button"
                style={{ ...confirmButton, opacity: processing ? 0.65 : 1 }}
                disabled={processing}
                onClick={clearSignups}
              >
                {processing ? "CLEARING…" : "CLEAR SIGNUPS"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}

function ResultNotice({ result }: { result: CleanupResult }) {
  const heading = result.status === "already_clear"
    ? "KWT ROOM SIGNUPS ALREADY CLEAR"
    : result.status === "partial"
      ? "KWT CLEANUP PARTIALLY COMPLETED"
      : "KWT ROOM SIGNUPS CLEARED"
  return (
    <div role="status" style={resultBox}>
      <strong>{heading}</strong>
      <span>Removed: {result.deletedCount}</span>
      {result.failedCount > 0 ? <span>Failed: {result.failedCount} — retry after checking bot access.</span> : null}
      <span>
        Protected: {result.protected.pinned} pinned, {result.protected.humanAdmin} human/admin,
        {" "}{result.protected.unrelatedBot} unrelated bot.
      </span>
    </div>
  )
}

const dangerCard: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10,
  marginTop: 26, padding: 18, borderRadius: 14, border: "1px solid #7f1d1d", background: "#1f0909",
}
const description: React.CSSProperties = { color: "#d1d5db", lineHeight: 1.5 }
const dangerButton: React.CSSProperties = {
  border: "1px solid #f87171", borderRadius: 8, background: "#7f1d1d", color: "white",
  padding: "11px 15px", fontWeight: 900, cursor: "pointer",
}
const backdrop: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center",
  padding: 20, background: "#000c",
}
const dialog: React.CSSProperties = {
  width: "min(520px, 100%)", border: "2px solid #f87171", borderRadius: 16,
  background: "#111", color: "white", padding: 24, boxShadow: "0 20px 70px #000",
}
const dialogCopy: React.CSSProperties = { color: "#e5e7eb", lineHeight: 1.5 }
const protectionList: React.CSSProperties = { color: "#d1d5db", lineHeight: 1.7 }
const actions: React.CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }
const cancelButton: React.CSSProperties = {
  border: "1px solid #6b7280", borderRadius: 8, background: "#27272a", color: "white",
  padding: "10px 14px", fontWeight: 800, cursor: "pointer",
}
const confirmButton: React.CSSProperties = {
  border: "1px solid #fecaca", borderRadius: 8, background: "#b91c1c", color: "white",
  padding: "10px 14px", fontWeight: 900, cursor: "pointer",
}
const resultBox: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 5, marginTop: 4, padding: 12,
  borderRadius: 9, background: "#052e16", color: "#dcfce7",
}
const errorText: React.CSSProperties = { color: "#fecaca", margin: 0 }
