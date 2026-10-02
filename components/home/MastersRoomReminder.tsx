"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { usePathname } from "next/navigation"
import Link from "next/link"
import MastersOfficialRules from "@/components/majors/MastersOfficialRules"
import type { MajorDayChoice, MajorPlayerScoringRound, MajorPlayDay } from "@/lib/majors"
import { MASTERS_HELP_CATEGORIES, type MastersHelpCategory } from "@/lib/mastersRules"
import {
  buildPublishedMastersRoomAssignments,
  dismissMastersRoomAssignment,
  MASTERS_ROOM_REMINDER_STORAGE_KEY,
  parseMastersRoomReminderDismissals,
  selectCurrentMastersRoomAssignment,
  shouldRenderMastersRoomReminderOnPath,
  shouldAutoOpenMastersRoomReminder,
  type MastersRoomReminderAssignment,
} from "@/lib/mastersRoomReminder"
import { formatMastersPlayerSlot } from "@/lib/mastersSignupDisplay"
import { supabase } from "@/lib/supabase"
import styles from "./MastersRoomReminder.module.css"

type ReminderMode = "hidden" | "open" | "collapsed"

function readDismissals() {
  try {
    return parseMastersRoomReminderDismissals(window.sessionStorage.getItem(MASTERS_ROOM_REMINDER_STORAGE_KEY))
  } catch {
    return {}
  }
}

function saveDismissal(assignment: MastersRoomReminderAssignment) {
  try {
    const dismissals = dismissMastersRoomAssignment(assignment, readDismissals())
    window.sessionStorage.setItem(MASTERS_ROOM_REMINDER_STORAGE_KEY, JSON.stringify(dismissals))
  } catch {
    // The reminder still closes for this page view when browser storage is unavailable.
  }
}

async function fetchCurrentMastersRoomAssignment() {
  const catalog = await loadMastersCatalog()
  if (!catalog) return null
  const { eventId, days } = catalog

  const [scheduleResult, scorecardsResult] = await Promise.all([
    supabase.rpc("get_my_major_signup_schedule", { p_major_event_id: eventId }),
    supabase.rpc("get_my_major_scorecards", { p_major_event_id: eventId }),
  ])
  if (scheduleResult.error || scorecardsResult.error) return null

  const assignments = buildPublishedMastersRoomAssignments(
    eventId,
    (scheduleResult.data as MajorDayChoice[] | null) || [],
    days,
  )
  return selectCurrentMastersRoomAssignment(
    assignments,
    ((scorecardsResult.data as MajorPlayerScoringRound[] | null) || []).map((round) => ({
      play_day_id: round.play_day_id,
      status: round.status,
    })),
  )
}

const MASTERS_CATALOG_CACHE_MS = 5 * 60_000
let mastersCatalogCache: { expiresAt: number; value: { eventId: string; days: MajorPlayDay[] } } | null = null
let mastersCatalogRequest: Promise<{ eventId: string; days: MajorPlayDay[] } | null> | null = null

async function loadMastersCatalog() {
  if (mastersCatalogCache && mastersCatalogCache.expiresAt > Date.now()) return mastersCatalogCache.value
  if (mastersCatalogRequest) return mastersCatalogRequest
  mastersCatalogRequest = (async () => {
    const eventResult = await supabase.from("major_events").select("id").eq("slug", "masters").maybeSingle()
    const eventId = eventResult.data?.id as string | undefined
    if (!eventId || eventResult.error) return null
    const daysResult = await supabase.from("major_play_days").select("*").eq("major_event_id", eventId).order("day_number")
    if (daysResult.error) return null
    const value = { eventId, days: (daysResult.data as MajorPlayDay[] | null) || [] }
    mastersCatalogCache = { expiresAt: Date.now() + MASTERS_CATALOG_CACHE_MS, value }
    return value
  })()
  try {
    return await mastersCatalogRequest
  } finally {
    mastersCatalogRequest = null
  }
}

export default function MastersRoomReminder() {
  const pathname = usePathname()
  const rendersOnCurrentPath = shouldRenderMastersRoomReminderOnPath(pathname)
  const isMastersScoringRoute = /^\/majors\/[^/]+\/scoring(?:\/|$)/.test(pathname || "")
  const [assignment, setAssignment] = useState<MastersRoomReminderAssignment | null>(null)
  const [mode, setMode] = useState<ReminderMode>("hidden")
  const [panel, setPanel] = useState<"room" | "rules" | "contact">("room")
  const [category, setCategory] = useState<MastersHelpCategory>("PLAYER NO-SHOW")
  const [details, setDetails] = useState("")
  const [contactState, setContactState] = useState<"idle" | "sending" | "sent" | "failed">("idle")
  const [contactMessage, setContactMessage] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const requestId = useRef(0)
  const lastSessionToken = useRef<string | null>(null)

  const refreshAssignment = useCallback(async (forceOpen = false) => {
    const currentRequestId = ++requestId.current
    setRefreshing(true)
    const current = await fetchCurrentMastersRoomAssignment()
    if (currentRequestId !== requestId.current) return
    setRefreshing(false)
    setAssignment(current)
    if (!current) {
      setMode("hidden")
      return
    }
    if (forceOpen) setPanel("room")
    setMode(forceOpen || shouldAutoOpenMastersRoomReminder(current, readDismissals()) ? "open" : "collapsed")
  }, [])

  useEffect(() => {
    if (!rendersOnCurrentPath) return

    let active = true
    const applySession = (session: Session | null) => {
      if (!active) return
      if (!session) {
        lastSessionToken.current = null
        requestId.current += 1
        setAssignment(null)
        setMode("hidden")
        return
      }
      if (lastSessionToken.current === session.access_token) return
      lastSessionToken.current = session.access_token
      void refreshAssignment()
    }
    void supabase.auth.getSession().then(({ data }) => applySession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => applySession(session))
    return () => {
      active = false
      requestId.current += 1
      listener.subscription.unsubscribe()
    }
  }, [refreshAssignment, rendersOnCurrentPath])

  if (!rendersOnCurrentPath || !assignment || mode === "hidden") return null

  if (mode === "collapsed") {
    return (
      <div className={`${styles.launcherDock} ${isMastersScoringRoute ? styles.scoringDock : ""}`}>
        <button
          type="button"
          className={styles.launcher}
          onClick={() => void refreshAssignment(true)}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          SHOW MASTERS ROOM
        </button>
      </div>
    )
  }

  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  const currentAssignment = assignment
  const localSlot = formatMastersPlayerSlot(currentAssignment.startsAt, currentAssignment.officialPlayDate, localTimeZone)

  async function sendAdminAlert() {
    if (!details.trim()) {
      setContactState("failed")
      setContactMessage("Add a short description so the Masters admins know how to help.")
      return
    }
    setContactState("sending")
    setContactMessage("")
    try {
      const response = await fetch("/api/majors/contact-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: currentAssignment.eventId,
          playDayId: currentAssignment.playDayId,
          category,
          message: details.trim(),
          localDisplayTime: `${localSlot.date}, ${localSlot.time}${localSlot.dayShift ? ` · ${localSlot.dayShift}` : ""}`,
        }),
      })
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(body.error || "We could not send your alert.")
      setContactState("sent")
      setContactMessage("ADMIN ALERT SENT")
    } catch (caught) {
      setContactState("failed")
      setContactMessage(caught instanceof Error ? caught.message : "WE COULD NOT SEND YOUR ALERT. Please try again or contact an admin directly.")
    }
  }

  return (
    <aside className={`${styles.card} ${isMastersScoringRoute ? styles.scoringCard : ""}`} role="dialog" aria-modal="false" aria-labelledby="masters-room-reminder-title">
      <button
        type="button"
        className={styles.close}
        aria-label="Close Masters room reminder"
        onClick={() => {
          saveDismissal(assignment)
          setMode("collapsed")
        }}
      >
        ×
      </button>
      <p className={styles.eyebrow}>YOUR MASTERS ROOM</p>
      <h2 id="masters-room-reminder-title">ROOM: {assignment.groupLabel}</h2>
      {panel === "room" && <>
        <p className={styles.round}>{assignment.roundLabel}</p>
        <div className={styles.when}>
          <strong>{localSlot.date}</strong>
          <span>{localSlot.time}</span>
          {localSlot.dayShift && <em>{localSlot.dayShift}</em>}
        </div>
        <h3>Playing with:</h3>
        <ul className={styles.roster}>
          {assignment.roster.map((player) => <li key={player.player_id}>{player.player_screen_name_snapshot}</li>)}
        </ul>
        {assignment.instructions && <section className={styles.instructions}><h3>ROOM INSTRUCTIONS</h3><p>{assignment.instructions}</p></section>}
      </>}
      {panel === "rules" && <MastersOfficialRules className={styles.rules} />}
      {panel === "contact" && <section className={styles.contact} aria-labelledby="masters-contact-title">
        <h3 id="masters-contact-title">CONTACT ADMIN</h3>
        <label>What do you need help with?
          <select value={category} onChange={(event) => setCategory(event.target.value as MastersHelpCategory)}>
            {MASTERS_HELP_CATEGORIES.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
        <label>Short details
          <textarea maxLength={800} rows={4} value={details} onChange={(event) => { setDetails(event.target.value); setContactState("idle") }} />
        </label>
        <button type="button" onClick={() => void sendAdminAlert()} disabled={contactState === "sending" || contactState === "sent"}>
          {contactState === "sending" ? "SENDING…" : contactState === "sent" ? "ALERT SENT" : "SEND ADMIN ALERT"}
        </button>
        {contactMessage && <p className={contactState === "sent" ? styles.contactSuccess : styles.contactError} role="status">{contactMessage}</p>}
      </section>}
      <nav className={styles.actions} aria-label="Masters gateway actions">
        <Link href={`/majors/masters/scoring?round=${assignment.dayNumber}&playDayId=${encodeURIComponent(assignment.playDayId)}`}>ENTER ROUND {assignment.dayNumber} SCORES</Link>
        <button type="button" onClick={() => setPanel(panel === "rules" ? "room" : "rules")}>{panel === "rules" ? "VIEW MY ROOM" : "VIEW INSTRUCTIONS & RULES"}</button>
        <button type="button" onClick={() => setPanel(panel === "contact" ? "room" : "contact")}>{panel === "contact" ? "VIEW MY ROOM" : "CONTACT ADMIN"}</button>
      </nav>
    </aside>
  )
}
