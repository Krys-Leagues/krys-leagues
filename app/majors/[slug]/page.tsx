"use client"

import Link from "next/link"
import Image from "next/image"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { formatMajorDate, formatMajorDeadline, formatMajorLocalTime, isMajorDayLocked, isMastersScorecardTheme, type MajorDayChoice, type MajorEntry, type MajorEvent, type MajorPlayDay, type MajorSignupStatus, type MajorTimeSlot } from "@/lib/majors"
import { createDiscordAuthCallbackUrl } from "@/lib/authReturnTo"
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
  const [reviewing, setReviewing] = useState(false)
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
    await supabase.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: createDiscordAuthCallbackUrl("player") } })
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
    setReviewing(false)
    await loadEvent()
  }

  if (loading) return <main className={styles.loading}>Loading Major…</main>
  if (!event) return <main className={styles.loading}><Link href="/majors">← Four Majors</Link>{slug === "test" ? <><h1>TEST EVENT</h1><p>Authenticated trusted-tester access is required. TEST DATA — NOT OFFICIAL.</p><button onClick={signIn} className={styles.primaryButton}>Sign in with Discord</button></> : <p>{message}</p>}</main>

  const masters = isMastersScorecardTheme(event)
  const testEvent = event.is_test_event
  const signupState = signupStatus?.state || (event.signup_open ? "open" : "closed")
  const signupDisabled = schedule.length > 0 ? !event.signup_open : signupState !== "open" && signupState !== "priority"
  const weekendStatus = schedule[0]?.weekend_competition_status || "pending"
  const secondaryFieldName = event.secondary_trophy_display_name || "Secondary Trophy Field"
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const allFourSelected = days.length === 4 && days.every((day) => Boolean(choices[day.id]))
  const publishedRooms = days
    .map((day) => ({ day, assignment: schedule.find((choice) => choice.play_day_id === day.id) }))
    .filter(({ assignment }) => Boolean(assignment?.group_label))

  return <main className={`${styles.page} ${masters ? styles.masters : styles.defaultTheme}`}><div className={styles.atmosphere}>{masters && <div className={styles.mastersScene} aria-hidden="true"><i className={styles.blossomTree} /><i className={styles.bench} /><i className={styles.putter} /><i className={styles.golfBall} /><i className={styles.golfBallTwo} /></div>}</div><div className={styles.container}>
    <Link href="/majors" className={styles.backLink}>← Four Majors</Link>
    <div className={styles.reviewActions}><Link href={`/majors/${slug}/scoring`} className={styles.primaryButton}>Enter my scores</Link><Link href={`/majors/${slug}/results`} className={styles.secondaryButton}>Live results</Link><Link href={`/majors/${slug}/stats`} className={styles.secondaryButton}>Bonus stats</Link></div>
    {testEvent && <div className={styles.testBanner}><strong>TEST EVENT</strong><span>TEST DATA — NOT OFFICIAL</span></div>}
    <header className={styles.hero}>
      <div className={styles.brandRow}><Image src="/league-media/BIG LOGO TRANSPARENT.png" width={136} height={136} alt="Krys Leagues" className={styles.logo} priority /><div><p className={styles.eyebrow}>{testEvent ? "Krys Leagues · Controlled testing" : "Krys Leagues · Majors Series"}</p><h1>{testEvent ? "TEST SIGNUP" : event.name}</h1><p className={styles.subtitle}>{testEvent ? "Reusable Major workflow rehearsal" : masters ? "Mini-Golf Style · Cherry Blossom" : "Major Championship"}</p></div></div>
      {masters && <div className={styles.mastersFeature} role="img" aria-label="Cherry Blossom course artwork from the Masters scorecard"><div className={styles.featureSheen} /></div>}
      <div className={styles.statusRow}><span className={styles.badge}>{event.status}</span><span className={`${styles.badge} ${styles[signupState]}`}>Signup {signupState}</span><span className={styles.capacity}>{signupStatus?.capacity ? `${signupStatus.spots_claimed} / ${signupStatus.capacity} spots claimed` : `${entries.length} claimed · field capacity not set`}</span></div>
      <p className={styles.meta}>{event.year || "Year to be announced"} · {formatMajorDate(event.starts_at)}</p>
      {event.description && <p className={styles.description}>{event.description}</p>}
      {(event.signup_open || schedule.length > 0) && <section className={styles.signupCard}>
        <h2>Choose all four preferred times</h2>
        <p className={styles.timezone}>Times shown in: <strong>{localTimeZone}</strong></p>
        {event.signup_instructions && <p className={styles.description}>{event.signup_instructions}</p>}
        <p className={styles.cutNotice}>Choose one independent time for Thursday, Friday, Saturday, and Sunday. After Friday qualifying, players in both weekend fields continue Saturday and Sunday; every saved weekend time remains intact.</p>
        {schedule.length > 0 && <p className={styles.assignment}>{event.weekend_status_published_at ? <>Weekend status: <strong>{weekendStatus === "main" ? "Masters Main Event" : weekendStatus === "secondary" ? secondaryFieldName : "Weekend field status pending"}</strong></> : <strong>Weekend field status pending</strong>}</p>}
        {signupState === "upcoming" && <p className={styles.notice}>Public signup opens {formatMajorDate(signupStatus?.public_signup_opens_at || null)}. Priority access is not active for this first Major.</p>}
        {signupState === "priority" && <p className={styles.notice}>Priority signup is open for eligible previous-Major players. Public signup opens {formatMajorDate(signupStatus?.public_signup_opens_at || null)}.</p>}
        {signupState === "full" && schedule.length === 0 && <p className={styles.notice}>The current field is full.</p>}
        {days.length !== 4 ? <p className={styles.notice}>Tournament staff is still configuring the four-day schedule.</p> : <div className={styles.days}>{days.map((day) => {
          const mine = schedule.find((choice) => choice.play_day_id === day.id)
          const daySlots = slots.filter((slot) => slot.play_day_id === day.id)
          const locked = mine?.is_locked ?? isMajorDayLocked(day)
          const dayName = DAY_LABELS[day.day_number - 1]
          return <fieldset key={day.id} className={styles.dayCard} disabled={locked || signupDisabled}>
            <legend><span>{dayName.day}</span>{day.label || dayName.round}</legend><p className={styles.dayDate}>{day.play_date}</p>
            <div className={styles.slotHeader}><span>Choose</span><span>Slot</span><strong>Your local time</strong></div>
            {daySlots.length ? daySlots.map((slot) => <label key={slot.id} className={`${styles.slotLabel} ${choices[day.id] === slot.id ? styles.selected : ""}`}><input type="radio" name={day.id} checked={choices[day.id] === slot.id} onChange={() => { setChoices((old) => ({ ...old, [day.id]: slot.id })); setReviewing(false) }} /><span className={styles.slotName}>{slot.label || "Available"}</span><span className={styles.localTime}>{formatMajorLocalTime(slot.starts_at, localTimeZone)}<small>{event.schedule_timezone !== localTimeZone ? `${formatMajorLocalTime(slot.starts_at, event.schedule_timezone)} · event time` : "Event reference time"}</small></span></label>) : <p className={styles.notice}>No times available yet.</p>}
            <p className={styles.lockDeadline}>{dayName.day} selections lock:<strong>{day.selection_locks_at ? formatMajorDeadline(day.selection_locks_at, localTimeZone) : "Deadline appears after the first time is scheduled"}</strong><span>{localTimeZone}</span></p>
            {locked && <p className={styles.locked}>Selection locked — tournament admins can still help</p>}
          </fieldset>
        })}</div>}
        {days.length === 4 && !reviewing && <button onClick={() => setReviewing(true)} disabled={saving || signupDisabled || !allFourSelected} className={styles.primaryButton}>{schedule.length ? "Review my updated times" : "Review my four times"}</button>}
        {reviewing && <section className={styles.signupReview}><p className={styles.eyebrow}>Your {testEvent ? "TEST" : masters ? "Masters" : "Major"} times</p><h3>Review all four days</h3><div>{days.map((day) => {
          const slot = slots.find((item) => item.id === choices[day.id])
          return <p key={day.id}><span>{DAY_LABELS[day.day_number - 1].day}</span><strong>{slot ? formatMajorLocalTime(slot.starts_at, localTimeZone) : "Not selected"}</strong></p>
        })}</div><p className={styles.reviewHelp}>These are preferred scheduling times. Each day stays independently editable until that day’s lock deadline.</p><div className={styles.reviewActions}><button type="button" className={styles.secondaryButton} onClick={() => setReviewing(false)}>Change a time</button><button type="button" onClick={signup} disabled={saving || signupDisabled || !allFourSelected} className={styles.primaryButton}>{saving ? "Saving…" : schedule.length ? "Confirm updated times" : "Confirm signup"}</button></div></section>}
        {publishedRooms.length > 0 && <section className={styles.roomSection}><p className={styles.eyebrow}>Your published rooms</p><h3>Who you’re playing with</h3><div className={styles.roomGrid}>{publishedRooms.map(({ day, assignment }) => assignment && <article key={day.id} className={styles.roomCard}><header><span>{DAY_LABELS[day.day_number - 1].day}</span><strong>{day.label || DAY_LABELS[day.day_number - 1].round}</strong></header><p className={styles.roomTime}>{assignment.starts_at ? formatMajorLocalTime(assignment.starts_at, localTimeZone) : "Time pending"}<small>{localTimeZone}</small></p><h4>{assignment.group_label}</h4><div className={styles.roomRoster}>{assignment.room_roster?.map((member) => <span key={member.player_id}>{member.player_screen_name_snapshot}</span>)}</div>{assignment.assignment_location && <div className={styles.roomDetail}><small>Course / lobby</small><strong>{assignment.assignment_location}</strong></div>}{assignment.group_instructions && <div className={styles.roomDetail}><small>Instructions</small><p>{assignment.group_instructions}</p></div>}</article>)}</div></section>}
      </section>}
      {message && <p className={styles.notice}>{message}</p>}
    </header>
    {[event.scheduling_instructions,event.qualifier_information,event.cut_information,event.weekend_information,event.room_rules,event.stream_information].some(Boolean) && <section className={styles.contentCard}><h2>Tournament information</h2>
      {event.scheduling_instructions && <InfoBlock title="Scheduling" body={event.scheduling_instructions} />}
      {event.qualifier_information && <InfoBlock title="Qualifying" body={event.qualifier_information} />}
      {event.cut_information && <InfoBlock title="Friday cut" body={event.cut_information} />}
      {event.weekend_information && <InfoBlock title="Weekend fields" body={event.weekend_information} />}
      {event.room_rules && <InfoBlock title="Room and play rules" body={event.room_rules} />}
      {event.stream_information && <InfoBlock title="Stream information" body={event.stream_information} />}
    </section>}
    {(event.stream_url || event.stream_scheduled_at) && <section className={styles.contentCard}><h2>Official broadcast</h2>{event.stream_is_live && <p className={styles.live}>● Live now</p>}<p className={styles.meta}>{event.stream_label || event.stream_platform || "Major broadcast"}</p>{event.stream_url && <a href={event.stream_url} target="_blank" rel="noreferrer" className={styles.streamLink}>Watch official stream ↗</a>}</section>}
    <section className={styles.contentCard}><h2>{testEvent ? "TEST field" : "Championship field"} <span>{entries.length}</span></h2>{entries.length === 0 ? <p className={styles.meta}>No public participants yet.</p> : <div className={styles.entrantGrid}>{entries.map((entry) => <div key={entry.id} className={styles.entrant}><strong>{entry.player_screen_name_snapshot}</strong><span>{entry.status}</span></div>)}</div>}</section>
  </div></main>
}

function InfoBlock({ title, body }: { title: string; body: string }) {
  return <div><h3>{title}</h3><p className={styles.description}>{body}</p></div>
}

const DAY_LABELS = [
  { day: "Thursday", round: "Qualifier Round 1" },
  { day: "Friday", round: "Qualifier Round 2" },
  { day: "Saturday", round: "Round 3" },
  { day: "Sunday", round: "Final Round" },
] as const
