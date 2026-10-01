"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"

import {
  canToggleManualStreamSlot,
  DEFAULT_MASTERS_MANUAL_STREAM_SLOTS,
  formatManualGolfScore,
  normalizeManualStreamCard,
  parseManualGolfScore,
  updateManualStreamSlot,
  type MastersManualStreamCard,
  type MastersManualStreamSlot,
} from "@/lib/mastersManualStreamCard"
import { supabase } from "@/lib/supabase"

import styles from "./page.module.css"

type ScoreDrafts = Record<number, string>

function scoreDrafts(slots: MastersManualStreamSlot[]): ScoreDrafts {
  return Object.fromEntries(slots.map((slot) => [slot.slot, formatManualGolfScore(slot.score)]))
}

export default function MastersManualStreamControllerPage() {
  const [card, setCard] = useState<MastersManualStreamCard | null>(null)
  const [slots, setSlots] = useState<MastersManualStreamSlot[]>(DEFAULT_MASTERS_MANUAL_STREAM_SLOTS)
  const [draftScores, setDraftScores] = useState<ScoreDrafts>(scoreDrafts(DEFAULT_MASTERS_MANUAL_STREAM_SLOTS))
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const editingRef = useRef(false)

  const loadCard = useCallback(async (force = false) => {
    const response = await supabase.rpc("get_public_masters_manual_stream_card")
    if (response.error) throw response.error
    const loaded = normalizeManualStreamCard(response.data)
    if (!loaded) throw new Error("Manual Masters stream card is unavailable.")
    setCard(loaded)
    if (force || !editingRef.current) {
      setSlots(loaded.slots)
      setDraftScores(scoreDrafts(loaded.slots))
    }
  }, [])

  useEffect(() => {
    // Initial synchronization with the isolated persistent stream-only state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCard(true).catch((error: Error) => setMessage(error.message))
    const timer = window.setInterval(() => void loadCard().catch(() => undefined), 700)
    return () => window.clearInterval(timer)
  }, [loadCard])

  async function commit(nextSlots: MastersManualStreamSlot[], successMessage = "Manual OBS card updated.") {
    if (!card) return
    setBusy(true)
    setSlots(nextSlots)
    const response = await supabase.rpc("update_masters_manual_stream_card", {
      p_expected_revision: card.revision,
      p_slots: nextSlots,
    })
    setBusy(false)
    if (response.error) {
      await loadCard(true).catch(() => undefined)
      setMessage(response.error.message.includes("STALE_MANUAL_STREAM_REVISION")
        ? "Another controller updated the card. The latest state was loaded; please try again."
        : response.error.message)
      return
    }
    await loadCard(true)
    setMessage(successMessage)
  }

  async function saveName(slotNumber: MastersManualStreamSlot["slot"]) {
    editingRef.current = false
    const nextSlots = slots
    if (nextSlots.find((slot) => slot.slot === slotNumber)?.name.length === 0) {
      setMessage(`Player ${slotNumber} name is blank; OBS will show a dash.`)
    }
    await commit(nextSlots, `Player ${slotNumber} name updated exactly as typed.`)
  }

  async function saveDirectScore(slotNumber: MastersManualStreamSlot["slot"]) {
    editingRef.current = false
    const parsed = parseManualGolfScore(draftScores[slotNumber] ?? "")
    if (parsed == null) {
      const current = slots.find((slot) => slot.slot === slotNumber)?.score ?? 0
      setDraftScores((previous) => ({ ...previous, [slotNumber]: formatManualGolfScore(current) }))
      setMessage("Enter a whole golf total from -999 to +999, 0, or E.")
      return
    }
    const nextSlots = updateManualStreamSlot(slots, slotNumber, { score: parsed })
    setDraftScores((previous) => ({ ...previous, [slotNumber]: formatManualGolfScore(parsed) }))
    await commit(nextSlots, `Player ${slotNumber} total set to ${formatManualGolfScore(parsed)}.`)
  }

  async function changeScore(slotNumber: MastersManualStreamSlot["slot"], delta: -1 | 1) {
    const current = slots.find((slot) => slot.slot === slotNumber)?.score ?? 0
    const nextScore = Math.max(-999, Math.min(999, current + delta))
    const nextSlots = updateManualStreamSlot(slots, slotNumber, { score: nextScore })
    setDraftScores((previous) => ({ ...previous, [slotNumber]: formatManualGolfScore(nextScore) }))
    await commit(nextSlots)
  }

  async function toggleSlot(slotNumber: MastersManualStreamSlot["slot"]) {
    if (!canToggleManualStreamSlot(slots, slotNumber)) {
      setMessage("Keep at least two players enabled for the broadcast card.")
      return
    }
    const current = slots.find((slot) => slot.slot === slotNumber)
    if (!current) return
    await commit(
      updateManualStreamSlot(slots, slotNumber, { enabled: !current.enabled }),
      `Player ${slotNumber} ${current.enabled ? "hidden from" : "shown on"} OBS.`,
    )
  }

  const browserOrigin = typeof window === "undefined" ? "" : window.location.origin

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/admin/majors" className={styles.back}>← Four Majors</Link>
          <p className={styles.eyebrow}>Protected · manual broadcast only</p>
          <h1>Masters Manual Scorecard</h1>
          <p>Type the four names in Walkabout order. These names and totals never touch official Masters scoring.</p>
        </div>
        <span className={styles.liveBadge}>● MANUAL LIVE</span>
      </header>

      {message && <p className={styles.notice} role="status">{message}</p>}

      <section className={styles.players} aria-label="Manual player score controls">
        {slots.map((slot) => (
          <article key={slot.slot} className={`${styles.playerCard} ${slot.enabled ? "" : styles.disabledCard}`}>
            <header>
              <div>
                <span>PLAYER {slot.slot}</span>
                <strong>{slot.name || "Name not entered"}</strong>
              </div>
              <button
                type="button"
                className={slot.enabled ? styles.onButton : styles.offButton}
                aria-pressed={slot.enabled}
                disabled={busy}
                onClick={() => void toggleSlot(slot.slot)}
              >
                {slot.enabled ? "ON" : "OFF"}
              </button>
            </header>

            <label className={styles.nameField}>
              <span>Name — exact text shown on OBS</span>
              <input
                type="text"
                maxLength={64}
                value={slot.name}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                aria-label={`Player ${slot.slot} manual screen name`}
                onFocus={() => { editingRef.current = true }}
                onChange={(event) => {
                  const nextSlots = updateManualStreamSlot(slots, slot.slot, { name: event.target.value })
                  setSlots(nextSlots)
                }}
                onBlur={() => void saveName(slot.slot)}
                onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur() }}
              />
            </label>

            <div className={styles.scoreArea}>
              <button
                type="button"
                aria-label={`Decrease ${slot.name || `Player ${slot.slot}`} score`}
                disabled={busy || slot.score <= -999}
                onClick={() => void changeScore(slot.slot, -1)}
              >−</button>
              <label>
                <span>Current golf score</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={draftScores[slot.slot] ?? formatManualGolfScore(slot.score)}
                  disabled={busy}
                  aria-label={`${slot.name || `Player ${slot.slot}`} direct golf score`}
                  onFocus={(event) => {
                    editingRef.current = true
                    if (/^e$/i.test(event.currentTarget.value)) {
                      setDraftScores((previous) => ({ ...previous, [slot.slot]: "0" }))
                    }
                    event.currentTarget.select()
                  }}
                  onChange={(event) => setDraftScores((previous) => ({ ...previous, [slot.slot]: event.target.value }))}
                  onBlur={() => void saveDirectScore(slot.slot)}
                  onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur() }}
                />
              </label>
              <button
                type="button"
                aria-label={`Increase ${slot.name || `Player ${slot.slot}`} score`}
                disabled={busy || slot.score >= 999}
                onClick={() => void changeScore(slot.slot, 1)}
              >+</button>
            </div>
          </article>
        ))}
      </section>

      <section className={styles.sourcePanel}>
        <div>
          <strong>KRYS MANUAL SCORECARD OBS · 1500 × 250</strong>
          <code>{browserOrigin}/majors/masters-stream/manual</code>
        </div>
        <p>Transparent outside the card. Add this URL as its own OBS Browser Source.</p>
      </section>
    </main>
  )
}
