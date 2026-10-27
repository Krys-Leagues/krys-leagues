"use client"

import { useMemo, useState } from "react"
import styles from "./page.module.css"

type Registration = { id: string; player_id: string; screen_name: string | null; player_timezone?: string | null; status: string }

type Props = { tournamentId: string; capacity: number; status: string; initialRegistrations: Registration[] }

export default function TournamentRegistrationPanel({ tournamentId, capacity, status, initialRegistrations }: Props) {
  const detected = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "", [])
  const [timeZone, setTimeZone] = useState(detected)
  const [registrations, setRegistrations] = useState(initialRegistrations)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const remaining = Math.max(capacity - registrations.length, 0)
  const isOpen = status === "registration_open"

  async function refreshRoster() {
    setRefreshing(true)
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}`, { cache: "no-store" })
      const body = await response.json().catch(() => ({})) as { registrations?: Registration[]; error?: string }
      if (!response.ok || !Array.isArray(body.registrations)) throw new Error(body.error || "The confirmed roster could not be refreshed.")
      setRegistrations(body.registrations)
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The confirmed roster could not be refreshed.")
      return false
    } finally {
      setRefreshing(false)
    }
  }

  async function register() {
    if (busy || confirmed) return
    if (!timeZone.trim()) { setMessage("Confirm your IANA time zone before registering."); return }
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timezone: timeZone.trim() }) })
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(body.error || "Registration could not be completed.")
      const rosterRefreshed = await refreshRoster()
      setConfirmed(true)
      setMessage(rosterRefreshed ? "Registration confirmed. Your canonical player is now on the roster." : "Registration confirmed. Press Refresh roster to retry the display update.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Registration could not be completed.")
    } finally {
      setBusy(false)
    }
  }

  return <section className={styles.registrationPanel} aria-labelledby="registration-title">
    <div className={styles.sectionHeading}><div><p className={styles.kicker}>Public registration</p><h2 id="registration-title">Claim your place</h2></div><strong className={styles.progress}>{registrations.length}/{capacity}</strong></div>
    <div className={styles.progressTrack} aria-label={`${registrations.length} of ${capacity} places confirmed`}><span style={{ width: `${Math.min((registrations.length / Math.max(capacity, 1)) * 100, 100)}%` }} /></div>
    <p className={styles.lead}><strong>{registrations.length} confirmed</strong> · <strong>{remaining} places remaining</strong></p>
    {isOpen ? <>
      <label className={styles.field}>Your local IANA time zone<input value={timeZone} onChange={(event) => setTimeZone(event.target.value)} placeholder="America/New_York" autoComplete="off" /></label>
      <p className={styles.helper}>Sign in with your existing Krys Leagues account, confirm or correct this time zone, then register. One canonical Global Player registration per tournament.</p>
      <button className={styles.primaryButton} type="button" disabled={busy || confirmed || remaining === 0} onClick={() => void register()}>{busy ? "Confirming…" : confirmed ? "Already registered" : remaining === 0 ? "Tournament full" : "SIGN UP"}</button>
      {message && <p className={styles.statusMessage} role="status" aria-live="polite">{message}</p>}
    </> : <p className={styles.closedMessage}>Registration is closed for this tournament.</p>}
    <div className={styles.rosterHeader}><h3>REGISTERED PLAYERS</h3><button className={styles.ghostButton} type="button" disabled={refreshing} onClick={() => void refreshRoster()}>{refreshing ? "Refreshing…" : "Refresh roster"}</button></div>
    {registrations.length ? <ol className={styles.roster}>{registrations.map((registration, index) => <li key={registration.id}><span className={styles.rosterNumber}>{String(index + 1).padStart(2, "0")}</span><strong>{registration.screen_name || "Confirmed player"}</strong></li>)}</ol> : <p className={styles.helper}>No confirmed players yet.</p>}
  </section>
}
