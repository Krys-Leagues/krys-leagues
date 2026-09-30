"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import type { MajorDayChoice, MajorPlayDay } from "@/lib/majors"
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
    return parseMastersRoomReminderDismissals(window.localStorage.getItem(MASTERS_ROOM_REMINDER_STORAGE_KEY))
  } catch {
    return {}
  }
}

function saveDismissal(assignment: MastersRoomReminderAssignment) {
  try {
    const dismissals = dismissMastersRoomAssignment(assignment, readDismissals())
    window.localStorage.setItem(MASTERS_ROOM_REMINDER_STORAGE_KEY, JSON.stringify(dismissals))
  } catch {
    // The reminder still closes for this page view when browser storage is unavailable.
  }
}

async function fetchCurrentMastersRoomAssignment() {
  const user = await supabase.auth.getUser()
  if (!user.data.user) return null

  const eventResult = await supabase.from("major_events").select("id").eq("slug", "masters").maybeSingle()
  const eventId = eventResult.data?.id as string | undefined
  if (!eventId || eventResult.error) return null

  const [scheduleResult, daysResult] = await Promise.all([
    supabase.rpc("get_my_major_signup_schedule", { p_major_event_id: eventId }),
    supabase.from("major_play_days").select("*").eq("major_event_id", eventId).order("day_number"),
  ])
  if (scheduleResult.error || daysResult.error) return null

  const assignments = buildPublishedMastersRoomAssignments(
    eventId,
    (scheduleResult.data as MajorDayChoice[] | null) || [],
    (daysResult.data as MajorPlayDay[] | null) || [],
  )
  return selectCurrentMastersRoomAssignment(assignments)
}

export default function MastersRoomReminder() {
  const pathname = usePathname()
  const rendersOnCurrentPath = shouldRenderMastersRoomReminderOnPath(pathname)
  const [assignment, setAssignment] = useState<MastersRoomReminderAssignment | null>(null)
  const [mode, setMode] = useState<ReminderMode>("hidden")
  const [refreshing, setRefreshing] = useState(false)
  const requestId = useRef(0)

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
    setMode(forceOpen || shouldAutoOpenMastersRoomReminder(current, readDismissals()) ? "open" : "collapsed")
  }, [])

  useEffect(() => {
    if (!rendersOnCurrentPath) return

    const initialRefresh = window.setTimeout(() => void refreshAssignment(), 0)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void refreshAssignment()
      else {
        requestId.current += 1
        setAssignment(null)
        setMode("hidden")
      }
    })
    return () => {
      window.clearTimeout(initialRefresh)
      requestId.current += 1
      listener.subscription.unsubscribe()
    }
  }, [refreshAssignment, rendersOnCurrentPath])

  if (!rendersOnCurrentPath || !assignment || mode === "hidden") return null

  if (mode === "collapsed") {
    return (
      <div className={styles.launcherDock}>
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
  const localSlot = formatMastersPlayerSlot(assignment.startsAt, assignment.officialPlayDate, localTimeZone)

  return (
    <aside className={styles.card} role="dialog" aria-modal="false" aria-labelledby="masters-room-reminder-title">
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
    </aside>
  )
}
