"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { formatMajorToPar, majorRoundDayLabel } from "@/lib/majors"
import {
  mastersAdminScoreTotals,
  mastersLateScoreCourse,
  mastersLateScoreState,
  type MastersLateScoreAdminRow,
} from "@/lib/mastersLateScoreAdmin"
import { formatMastersAdminDateTime } from "@/lib/mastersSignupDisplay"

import styles from "./MastersLateScoreAdmin.module.css"

type Payload = {
  event?: { id: string; name: string; schedule_timezone: string }
  rows?: MastersLateScoreAdminRow[]
  error?: string
}

export default function MastersLateScoreAdmin({ eventId }: { eventId: string }) {
  const [payload, setPayload] = useState<Payload>({})
  const [search, setSearch] = useState("")
  const [entryId, setEntryId] = useState("")
  const [dayNumber, setDayNumber] = useState(1)
  const [reason, setReason] = useState("")
  const [values, setValues] = useState<string[]>(Array(18).fill(""))
  const [showEntry, setShowEntry] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  const load = useCallback(async () => {
    if (!eventId) return
    const result = await fetch(`/api/admin/majors/late-scores?${new URLSearchParams({ eventId })}`, { cache: "no-store" })
    const body = await result.json().catch(() => ({})) as Payload
    setPayload(body)
    if (!result.ok) setMessage(body.error || "Late-score status could not be loaded.")
  }, [eventId])

  // Initial authenticated admin synchronization for the selected event.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const players = useMemo(() => {
    const unique = new Map<string, { entryId: string; name: string }>()
    for (const row of payload.rows || []) unique.set(row.entryId, { entryId: row.entryId, name: row.playerName })
    return [...unique.values()]
      .filter((player) => player.name.toLowerCase().includes(search.trim().toLowerCase()))
      .toSorted((left, right) => left.name.localeCompare(right.name))
  }, [payload.rows, search])
  const playerRows = (payload.rows || []).filter((row) => row.entryId === entryId)
  const row = playerRows.find((candidate) => candidate.dayNumber === dayNumber)
  const state = row ? mastersLateScoreState(row) : null
  const course = mastersLateScoreCourse(dayNumber)
  const totals = mastersAdminScoreTotals(dayNumber, values)

  function selectScope(nextEntryId: string, nextDayNumber: number) {
    const selected = (payload.rows || []).find((candidate) => candidate.entryId === nextEntryId && candidate.dayNumber === nextDayNumber)
    setEntryId(nextEntryId)
    setDayNumber(nextDayNumber)
    setValues(Array.from({ length: 18 }, (_, index) => String(selected?.holes.find((hole) => hole.hole_number === index + 1)?.strokes || "")))
    setShowEntry(false)
    setMessage("")
  }

  async function perform(action: "reopen" | "admin_entry") {
    if (!row) return
    if (action === "reopen" && !window.confirm(`REOPEN ${row.playerName} — ROUND ${row.dayNumber} FOR ONE HOUR?`)) return
    if (action === "admin_entry") {
      const warning = state === "open"
        ? `PLAYER ENTRY IS CURRENTLY OPEN.\n\nYou are entering this score as an administrator for ${row.playerName}, Round ${row.dayNumber}. Continue?`
        : `SUBMIT THIS ROUND ${row.dayNumber} SCORECARD ON BEHALF OF ${row.playerName}?`
      if (!window.confirm(warning)) return
    }
    setBusy(true)
    setMessage("")
    const result = await fetch("/api/admin/majors/late-scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        eventId: row.eventId,
        playDayId: row.playDayId,
        entryId: row.entryId,
        reason,
        ...(action === "admin_entry" ? { holes: values.map((value, index) => ({ hole_number: index + 1, strokes: Number(value) })) } : {}),
      }),
    })
    const body = await result.json().catch(() => ({})) as { error?: string; warning?: string; reopenedUntil?: string }
    setBusy(false)
    if (!result.ok) {
      setMessage(body.error || "The late-score action failed safely.")
      return
    }
    setMessage(action === "reopen"
      ? `Player access reopened until ${formatMastersAdminDateTime(body.reopenedUntil || "", payload.event?.schedule_timezone)}.`
      : body.warning || "Scorecard entered by admin and sent to normal verification.")
    setShowEntry(false)
    await load()
  }

  return <section className={styles.panel} aria-labelledby="late-score-title">
    <header><p>ADMIN EXCEPTION</p><h2 id="late-score-title">LATE / MISSING SCORE</h2><span>One player · one round. Normal scoring deadlines remain unchanged.</span></header>
    <div className={styles.pickers}>
      <label>Search Global Players entrant<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Start typing the screen name" /></label>
      <label>Player<select value={entryId} onChange={(event) => selectScope(event.target.value, dayNumber)}><option value="">Select the exact entrant</option>{players.map((player) => <option key={player.entryId} value={player.entryId}>{player.name}</option>)}</select></label>
      <label>Round<select value={dayNumber} onChange={(event) => selectScope(entryId, Number(event.target.value))}>{[1, 2, 3, 4].map((round) => <option key={round} value={round}>{majorRoundDayLabel(round)}</option>)}</select></label>
    </div>
    {entryId && !row && <p className={styles.notice}>This player does not have a complete published room for the selected round. No exception action is available.</p>}
    {row && <>
      <dl className={styles.context}>
        <div><dt>PLAYER</dt><dd>{row.playerName}</dd></div>
        <div><dt>ROUND</dt><dd>Round {row.dayNumber}</dd></div>
        <div><dt>ROOM</dt><dd>{row.roomLabel}</dd></div>
        <div><dt>SCHEDULED</dt><dd>{formatMastersAdminDateTime(row.scheduledAt, payload.event?.schedule_timezone)}</dd></div>
        <div><dt>SCORECARD</dt><dd>{row.scorecardStatus?.toUpperCase() || "NO SCORECARD"}</dd></div>
        <div><dt>ENTRY STATUS</dt><dd>{state === "reopened" ? "REOPENED" : state?.replaceAll("_", " ").toUpperCase()}</dd></div>
      </dl>
      {row.reopenedUntil && state === "reopened" && <p className={styles.reopened}><strong>REOPENED UNTIL:</strong> {formatMastersAdminDateTime(row.reopenedUntil, payload.event?.schedule_timezone)}</p>}
      <label className={styles.reason}>Optional admin note<input maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <div className={styles.actions}>
        <button type="button" disabled={busy || state !== "expired"} onClick={() => void perform("reopen")}>REOPEN FOR PLAYER</button>
        <button type="button" disabled={busy || !["open", "expired", "reopened"].includes(state || "")} onClick={() => setShowEntry(true)}>ADMIN ENTER SCORE</button>
      </div>
      {["submitted", "verified"].includes(state || "") && <p className={styles.protected}>This {state} scorecard is protected. Use the established correction workflow instead of overwriting it.</p>}
      {state === "open" && <p className={styles.notice}>This player is still inside the normal score-entry window. No late exception is needed.</p>}
      {state === "finalized" && <p className={styles.protected}>This round is finalized. The late-entry tool will not alter it.</p>}
      {showEntry && <section className={styles.entry}>
        <header><div><p>ENTERED BY ADMIN ON BEHALF OF PLAYER</p><h3>{row.playerName} · Round {row.dayNumber}</h3><span>{course.name} · {row.roomLabel}</span></div><div><strong>{totals.total ?? "—"}</strong><span>{totals.toPar === null ? "18 holes required" : formatMajorToPar(totals.toPar)}</span></div></header>
        <div className={styles.scoreScroll}><table><tbody>
          <tr><th>HOLE</th>{course.pars.map((_, index) => <th key={index}>{index + 1}</th>)}</tr>
          <tr><th>PAR</th>{course.pars.map((par, index) => <td key={index}>{par}</td>)}</tr>
          <tr><th>SCORE</th>{course.pars.map((_, index) => <td key={index}><label className={styles.srOnly} htmlFor={`late-score-${index + 1}`}>Hole {index + 1}</label><input id={`late-score-${index + 1}`} type="number" inputMode="numeric" min={1} max={99} value={values[index]} onChange={(event) => setValues((current) => current.map((value, valueIndex) => valueIndex === index ? event.target.value : value))} /></td>)}</tr>
        </tbody></table></div>
        <div className={styles.actions}><button type="button" onClick={() => setShowEntry(false)}>CANCEL</button><button type="button" disabled={busy || !totals.complete} onClick={() => void perform("admin_entry")}>SUBMIT FOR VERIFICATION</button></div>
      </section>}
    </>}
    {message && <p className={styles.notice} role="status">{message}</p>}
  </section>
}
