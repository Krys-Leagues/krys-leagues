"use client"

import Link from "next/link"
import Image from "next/image"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { formatMajorDate, formatMajorSlot, isMastersScorecardTheme, type MajorDayChoice, type MajorEntry, type MajorEvent, type MajorPlayDay, type MajorSignupStatus, type MajorTimeSlot } from "@/lib/majors"
import { supabase } from "@/lib/supabase"
import styles from "./page.module.css"

export default function MajorDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const [event, setEvent] = useState<MajorEvent | null>(null)
  const [entries, setEntries] = useState<MajorEntry[]>([])
  const [days, setDays] = useState<MajorPlayDay[]>([])
  const [slots, setSlots] = useState<MajorTimeSlot[]>([])
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [schedule, setSchedule] = useState<MajorDayChoice[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const [signupStatus, setSignupStatus] = useState<MajorSignupStatus | null>(null)

  const loadEvent = useCallback(async () => {
    const eventResult = await supabase.from("major_events").select("*").eq("slug", slug).maybeSingle()
    const loadedEvent = eventResult.data as MajorEvent | null
    setEvent(loadedEvent)
    if (!loadedEvent) { setMessage(eventResult.error?.message || "This Major is not available."); setLoading(false); return }
    const [entryResult, dayResult] = await Promise.all([
      supabase.from("major_entries").select("*").eq("major_event_id", loadedEvent.id).order("registered_at"),
      supabase.from("major_play_days").select("*").eq("major_event_id", loadedEvent.id).order("day_number"),
    ])
    const loadedDays = (dayResult.data as MajorPlayDay[] | null) || []
    const dayIds = loadedDays.map((day) => day.id)
    const slotResult = dayIds.length ? await supabase.from("major_time_slots").select("*").in("play_day_id", dayIds).eq("is_available", true).order("starts_at") : { data: [], error: null }
    const statusResult = await supabase.rpc("get_major_signup_status", { p_major_event_id: loadedEvent.id })
    setEntries((entryResult.data as MajorEntry[] | null) || [])
    setDays(loadedDays)
    setSlots((slotResult.data as MajorTimeSlot[] | null) || [])
    setSignupStatus(statusResult.data as MajorSignupStatus | null)
    const user = await supabase.auth.getUser()
    if (user.data.user) {
      const result = await supabase.rpc("get_my_major_signup_schedule", { p_major_event_id: loadedEvent.id })
      const mine = (result.data as MajorDayChoice[] | null) || []
      setSchedule(mine)
      setChoices(Object.fromEntries(mine.map((choice) => [choice.play_day_id, choice.time_slot_id])))
    }
    setMessage(eventResult.error?.message || entryResult.error?.message || dayResult.error?.message || slotResult.error?.message || "")
    setLoading(false)
  }, [slug])

  useEffect(() => {
    // Initial client-side Supabase synchronization for the route parameter.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEvent()
  }, [loadEvent])

  async function signIn() {
    await supabase.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/majors/${slug}`)}&type=player` } })
  }

  async function signup() {
    if (!event) return
    setSaving(true); setMessage("")
    const user = await supabase.auth.getUser()
    if (!user.data.user) { setSaving(false); await signIn(); return }
    const selected = days.map((day) => choices[day.id]).filter(Boolean)
    if (days.length !== 4 || selected.length !== 4) { setSaving(false); setMessage("Choose one time for each of the four tournament days."); return }
    const result = await supabase.rpc("signup_for_major_with_slots", { p_major_event_id: event.id, p_time_slot_ids: selected })
    setSaving(false)
    if (result.error) { setMessage(result.error.message); return }
    setMessage("You are registered and all four day choices are saved.")
    await loadEvent()
  }

  if (loading) return <main className={styles.loading}>Loading Major…</main>
  if (!event) return <main className={styles.loading}><Link href="/majors">← Four Majors</Link><p>{message}</p></main>

  const masters = isMastersScorecardTheme(event)
  const signupState = signupStatus?.state || (event.signup_open ? "open" : "closed")
  const signupDisabled = signupState !== "open" && signupState !== "priority"

  return <main className={`${styles.page} ${masters ? styles.masters : styles.defaultTheme}`}><div className={styles.atmosphere} /><div className={styles.container}>
    <Link href="/majors" className={styles.backLink}>← Four Majors</Link>
    <header className={styles.hero}>
      <div className={styles.brandRow}><Image src="/league-media/BIG LOGO TRANSPARENT.png" width={136} height={136} alt="Krys Leagues" className={styles.logo} priority /><div><p className={styles.eyebrow}>Krys Leagues · Majors Series</p><h1>{event.name}</h1><p className={styles.subtitle}>{masters ? "Mini-Golf Style · Cherry Blossom" : "Major Championship"}</p></div></div>
      <div className={styles.statusRow}><span className={styles.badge}>{event.status}</span><span className={`${styles.badge} ${styles[signupState]}`}>Signup {signupState}</span><span className={styles.capacity}>{signupStatus?.spots_claimed ?? entries.length} claimed {signupStatus?.capacity ? `of ${signupStatus.capacity}` : "· field capacity not set"}</span></div>
      <p className={styles.meta}>{event.year || "Year to be announced"} · {formatMajorDate(event.starts_at)}</p>
      {event.description && <p className={styles.description}>{event.description}</p>}
      {event.signup_open && <section className={styles.signupCard}>
        <h2>Choose all four play times</h2>
        <p className={styles.timezone}>◷ Times shown in your time zone: <strong>{Intl.DateTimeFormat().resolvedOptions().timeZone}</strong></p>
        <p className={styles.cutNotice}>Rounds 1 and 2 determine the cut. Choose times for Days 3 and 4 now, but those later times only apply if you advance.</p>
        {signupState === "upcoming" && <p className={styles.notice}>Public signup opens {formatMajorDate(signupStatus?.public_signup_opens_at || null)}. Priority access is not active for this first Major.</p>}
        {signupState === "priority" && <p className={styles.notice}>Priority signup is open for eligible previous-Major players. Public signup opens {formatMajorDate(signupStatus?.public_signup_opens_at || null)}.</p>}
        {signupState === "full" && <p className={styles.notice}>The current field is full.</p>}
        {days.length !== 4 ? <p className={styles.notice}>Tournament staff is still configuring the four-day schedule.</p> : <div className={styles.days}>{days.map((day) => {
          const mine = schedule.find((choice) => choice.play_day_id === day.id)
          const daySlots = slots.filter((slot) => slot.play_day_id === day.id)
          return <fieldset key={day.id} className={styles.dayCard} disabled={day.choices_locked || signupDisabled}>
            <legend><span>Day {day.day_number}</span>{day.label}</legend><p className={styles.dayDate}>{day.play_date}</p>
            {daySlots.length ? daySlots.map((slot) => <label key={slot.id} className={`${styles.slotLabel} ${choices[day.id] === slot.id ? styles.selected : ""}`}><input type="radio" name={day.id} checked={choices[day.id] === slot.id} onChange={() => setChoices((old) => ({ ...old, [day.id]: slot.id }))} /><span>{formatMajorSlot(slot.starts_at)}{slot.label ? <small>{slot.label}</small> : null}</span></label>) : <p className={styles.notice}>No times available yet.</p>}
            {mine?.assignment_location ? <p className={styles.assignment}>Play at: {mine.assignment_location}</p> : <p className={styles.meta}>Location and instructions will be assigned by tournament staff.</p>}
            {day.choices_locked && <p className={styles.locked}>◆ Selection locked</p>}
          </fieldset>
        })}</div>}
        {days.length === 4 && <button onClick={signup} disabled={saving || signupDisabled} className={styles.primaryButton}>{saving ? "Saving…" : schedule.length ? "Update my four times" : "Register and save my four times"}</button>}
      </section>}
      {message && <p className={styles.notice}>{message}</p>}
    </header>
    {(event.stream_url || event.stream_scheduled_at) && <section className={styles.contentCard}><h2>Official broadcast</h2>{event.stream_is_live && <p className={styles.live}>● Live now</p>}<p className={styles.meta}>{event.stream_label || event.stream_platform || "Major broadcast"}</p>{event.stream_url && <a href={event.stream_url} target="_blank" rel="noreferrer" className={styles.streamLink}>Watch official stream ↗</a>}</section>}
    <section className={styles.contentCard}><h2>Championship field <span>{entries.length}</span></h2>{entries.length === 0 ? <p className={styles.meta}>No public participants yet.</p> : <div className={styles.entrantGrid}>{entries.map((entry) => <div key={entry.id} className={styles.entrant}><strong>{entry.player_screen_name_snapshot}</strong><span>{entry.status}</span></div>)}</div>}</section>
  </div></main>
}
