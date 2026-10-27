"use client"

import { useMemo, useState } from "react"

export default function RegisterForTournamentButton({ tournamentId }: { tournamentId: string }) {
  const detected = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "", [])
  const [timeZone, setTimeZone] = useState(detected)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  async function register() {
    if (!timeZone.trim()) {
      setMessage("Enter your IANA time zone before registering.")
      return
    }
    setBusy(true)
    setMessage("")
    const response = await fetch(`/api/tournaments/${tournamentId}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timezone: timeZone.trim() }) })
    const body = await response.json().catch(() => ({})) as { error?: string; registration?: { status?: string } }
    setMessage(body.error || (body.registration?.status === "confirmed" ? "You are confirmed. Your canonical Global Player and time zone were saved." : "Registration submitted."))
    setBusy(false)
  }

  return <div style={{ display: "grid", gap: 8, maxWidth: 420, margin: "18px 0" }}>
    <label style={{ color: "#cbd5e1", fontSize: 13 }}>Your local time zone (confirm or correct before registering)
      <input value={timeZone} onChange={(event) => setTimeZone(event.target.value)} placeholder="America/New_York" style={{ display: "block", width: "100%", marginTop: 6, padding: 10, borderRadius: 9, border: "1px solid #475569", background: "#070b12", color: "white" }} />
    </label>
    <button style={button} type="button" disabled={busy} onClick={() => void register()}>{busy ? "Registering…" : "Register with Discord"}</button>
    {message && <p role="status" style={{ margin: 0, color: "#fde68a" }}>{message}</p>}
  </div>
}

const button: React.CSSProperties = { width: "fit-content", padding: "11px 17px", border: 0, borderRadius: 999, background: "#f0abfc", color: "#24102c", fontWeight: 900 }

