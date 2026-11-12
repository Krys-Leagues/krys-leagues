"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { createDiscordAuthCallbackUrl } from "@/lib/authReturnTo"
import { formatMgaLocalTime, MGA_DAYS, MGA_REGULAR_EVENT_ID, type MgaDayKey } from "@/lib/mgaRegular"
import { supabase } from "@/lib/supabase"
import styles from "./page.module.css"

type PublishedRoom = {
  registration_id: string
  canonical_player_id: string
  day_key: MgaDayKey
  room_name: string
  event_date: string
  starts_at: string
  eastern_label: string | null
  player_time_zone: string
  round_label: string | null
  course_name: string | null
  published_at: string
}

const DISMISSED_KEY = "krys-leagues:mga-room-notices-dismissed"

export default function MgaChampionshipPage() {
  const [rooms, setRooms] = useState<PublishedRoom[]>([])
  const [signedIn, setSignedIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [dismissed, setDismissed] = useState<string[]>([])

  const loadRooms = useCallback(async () => {
    const session = await supabase.auth.getSession()
    setSignedIn(Boolean(session.data.session))
    if (!session.data.session) {
      setRooms([])
      setLoading(false)
      return
    }
    const response = await supabase.rpc("mga_regular_my_published_rooms_v1", { p_event_id: MGA_REGULAR_EVENT_ID })
    setRooms((response.data as PublishedRoom[] | null) || [])
    setError(response.error?.message || "")
    setLoading(false)
  }, [])

  // Read browser-only dismissal state after hydration to avoid server/client mismatch.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(DISMISSED_KEY)
        if (stored) setDismissed(JSON.parse(stored) as string[])
      } catch { /* Leave notices visible if browser storage is unavailable. */ }
    }, 0)
    const initialTimer = window.setTimeout(() => { void loadRooms() }, 0)
    const pollTimer = window.setInterval(() => { void loadRooms() }, 30_000)
    return () => { window.clearTimeout(timer); window.clearTimeout(initialTimer); window.clearInterval(pollTimer) }
  }, [loadRooms])

  const activeNotice = useMemo(() => rooms.find((room) => !dismissed.includes(noticeKey(room))) || null, [dismissed, rooms])

  function dismissNotice(room: PublishedRoom) {
    const next = [...new Set([...dismissed, noticeKey(room)])]
    setDismissed(next)
    try { window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next)) } catch { /* The modal can still close if storage is unavailable. */ }
  }

  async function signIn() {
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: createDiscordAuthCallbackUrl("player", "/mga") },
    })
    if (authError) setError(authError.message)
  }

  const hiddenRoomCount = rooms.filter((room) => dismissed.includes(noticeKey(room))).length

  return <main className={styles.page}>
    <div className={styles.shell}>
      <nav className={styles.nav}><Link href="/majors">← Four Majors</Link><Link href="/">Krys Leagues</Link></nav>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Krys Leagues · Four Majors</p>
        <h1>The MGA Championship</h1>
        <p>Gardens of Babylon · November 12–15, 2026</p>
        <div className={styles.actions}><span aria-disabled="true" title="MGA player scorecard integration is not yet available">Scorecards unavailable</span><span aria-disabled="true" title="MGA results integration is not yet available">Results unavailable</span><Link href="#rooms">My Rooms</Link></div>
      </header>
      <section className={styles.panel}>
        <div><p className={styles.eyebrow}>Player access</p><h2>Your tournament cards and room updates</h2><p>Sign in with the Discord account connected to your MGA registration. Room alerts appear here after Admin publishes each day.</p></div>
        {signedIn ? <button onClick={() => void loadRooms()}>Refresh assignments</button> : <button onClick={() => void signIn()}>Sign in with Discord</button>}
      </section>
      {loading && <p className={styles.message} role="status">Checking published room assignments…</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {signedIn && !loading && <section id="rooms" className={styles.panel}>
        <div className={styles.roomHeading}><div><p className={styles.eyebrow}>Private player view</p><h2>Your published rooms</h2></div>{rooms.length > 0 && <span>{rooms.length} assignment{rooms.length === 1 ? "" : "s"}</span>}</div>
        {!rooms.length ? <p>Room assignments will appear here after Admin publishes a tournament day.</p> : <div className={styles.rooms}>{rooms.map((room) => {
          const day = MGA_DAYS.find((item) => item.key === room.day_key)
          return <article key={`${room.day_key}:${room.registration_id}`} className={styles.roomCard}>
            <div><span>{day?.label || room.event_date}</span><small>{room.round_label || day?.round}</small></div>
            <h3>{room.room_name}</h3>
            <strong>{formatMgaLocalTime(room.starts_at, room.player_time_zone)}</strong>
            <small>{room.player_time_zone} · {room.eastern_label || "Eastern time unavailable"}</small>
            <p>{room.course_name || "Gardens of Babylon"}</p>
          </article>
        })}</div>}
        {hiddenRoomCount > 0 && <button className={styles.textButton} onClick={() => setDismissed([])}>Show room alerts again</button>}
      </section>}
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Four tournament rounds</p><h2>Gardens of Babylon</h2>
        <div className={styles.dayList}>{MGA_DAYS.map((day) => <div key={day.key}><strong>{day.label}</strong><span>{day.round}</span><span>{day.key === "thursday" || day.key === "friday" ? "Gardens of Babylon Easy" : "Gardens of Babylon Hard"}</span></div>)}</div>
      </section>
    </div>
    {activeNotice && <div className={styles.scrim} role="presentation">
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="room-notice-title" aria-describedby="room-notice-copy">
        <p className={styles.eyebrow}>MGA room assignment published</p>
        <h2 id="room-notice-title">You’re in {activeNotice.room_name}</h2>
        <p id="room-notice-copy">{MGA_DAYS.find((item) => item.key === activeNotice.day_key)?.label} · {activeNotice.round_label || "Tournament round"}</p>
        <p className={styles.noticeTime}>{formatMgaLocalTime(activeNotice.starts_at, activeNotice.player_time_zone)}</p>
        <p>{activeNotice.player_time_zone}<br /><small>Eastern event time: {activeNotice.eastern_label || "Unavailable"}</small></p>
        <div className={styles.actions}><Link href="#rooms" onClick={() => dismissNotice(activeNotice)}>View my rooms</Link><button onClick={() => dismissNotice(activeNotice)}>Got it</button></div>
      </section>
    </div>}
  </main>
}

function noticeKey(room: PublishedRoom) {
  return `${room.registration_id}:${room.day_key}:${room.published_at}`
}
