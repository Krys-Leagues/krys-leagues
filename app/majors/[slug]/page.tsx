"use client"

import Link from "next/link"
import Image from "next/image"
import { useParams, usePathname } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { isMajorSlotMoveOutLocked, isMajorSlotStarted, isMastersScorecardTheme, type MajorDayChoice, type MajorEvent, type MajorPlayDay, type MajorSignupStatus, type MajorTimeSlot } from "@/lib/majors"
import { createDiscordAuthCallbackUrl } from "@/lib/authReturnTo"
import MajorTimeZoneControl from "@/components/MajorTimeZoneControl"
import { formatMajorLocalDate, formatMajorLocalDateTime, formatMajorLocalTimeWithZone } from "@/lib/majorTimeZone"
import { supabase } from "@/lib/supabase"
import { useMajorDisplayTimeZone } from "@/lib/useMajorDisplayTimeZone"
import styles from "./page.module.css"

type PublicMajorEntry = {
  roster_position: number
  player_screen_name_snapshot: string
  status: "registered" | "confirmed" | "waitlisted"
}

export default function MajorDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const pathname = usePathname()
  const vipEntry = pathname.endsWith("/vip")
  const [event, setEvent] = useState<MajorEvent | null>(null)
  const [entries, setEntries] = useState<PublicMajorEntry[]>([])
  const [days, setDays] = useState<MajorPlayDay[]>([])
  const [slots, setSlots] = useState<MajorTimeSlot[]>([])
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [schedule, setSchedule] = useState<MajorDayChoice[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [signupStatus, setSignupStatus] = useState<MajorSignupStatus | null>(null)
  const [authenticated, setAuthenticated] = useState(false)
  const [siteAdmin, setSiteAdmin] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const displayTimeZone = useMajorDisplayTimeZone()

  const loadEvent = useCallback(async () => {
    const eventResult = await supabase.from("major_events").select("*").eq("slug", slug).maybeSingle()
    const loadedEvent = eventResult.data as MajorEvent | null
    setEvent(loadedEvent)
    if (!loadedEvent) { setMessage(eventResult.error?.message || "This Major is not available."); setLoading(false); return }
    const [entryResult, dayResult] = await Promise.all([
      supabase.rpc("get_public_major_entries", { p_major_event_id: loadedEvent.id }),
      supabase.from("major_play_days").select("*").eq("major_event_id", loadedEvent.id).order("day_number"),
    ])
    const loadedDays = (dayResult.data as MajorPlayDay[] | null) || []
    const dayIds = loadedDays.map((day) => day.id)
    const slotResult = dayIds.length ? await supabase.from("major_time_slots").select("*").in("play_day_id", dayIds).eq("is_available", true).order("starts_at") : { data: [], error: null }
    const statusResult = await supabase.rpc("get_major_signup_status", { p_major_event_id: loadedEvent.id })
    let loadedSignupStatus = statusResult.data as MajorSignupStatus | null
    if (loadedEvent.slug.trim().toLowerCase() === "major-2") {
      try {
        const sessionResult = await supabase.auth.getSession()
        setAuthenticated(Boolean(sessionResult.data.session?.user))
        setSiteAdmin(false)
        if (sessionResult.data.session?.access_token) {
          try {
            const adminResponse = await fetch("/api/auth/admin-authorization", {
              headers: { Authorization: `Bearer ${sessionResult.data.session.access_token}` },
              cache: "no-store",
            })
            if (adminResponse.ok) {
              const adminPayload = await adminResponse.json() as { siteAdmin?: boolean }
              setSiteAdmin(Boolean(adminPayload.siteAdmin))
            }
          } catch {
            setSiteAdmin(false)
          }
        } else {
          setSiteAdmin(false)
        }
        if (vipEntry) {
          const personalizedStatus = await fetch("/api/majors/home-banner", {
            cache: "no-store",
            headers: sessionResult.data.session?.access_token
              ? { Authorization: `Bearer ${sessionResult.data.session.access_token}` }
              : undefined,
          })
          const personalizedPayload = personalizedStatus.ok ? await personalizedStatus.json() as { state?: MajorSignupStatus["state"] } : null
          if (personalizedPayload?.state) loadedSignupStatus = loadedSignupStatus ? { ...loadedSignupStatus, state: personalizedPayload.state } : null
          else if (loadedSignupStatus?.state === "priority") loadedSignupStatus = { ...loadedSignupStatus, state: "upcoming" }
        } else if (loadedSignupStatus?.state === "priority") {
          loadedSignupStatus = { ...loadedSignupStatus, state: "upcoming" }
        }
      } catch {
        // Fail closed for the VIP-only window if the personalized status check is unavailable.
        if (loadedSignupStatus?.state === "priority") loadedSignupStatus = { ...loadedSignupStatus, state: "upcoming" }
      }
    }
    setEntries((entryResult.data as PublicMajorEntry[] | null) || [])
    setDays(loadedDays)
    setSlots((slotResult.data as MajorTimeSlot[] | null) || [])
    setSignupStatus(loadedSignupStatus)
    const user = await supabase.auth.getUser()
    setAuthenticated(Boolean(user.data.user))
    if (user.data.user) {
      const result = await supabase.rpc("get_my_major_signup_schedule", { p_major_event_id: loadedEvent.id })
      const mine = (result.data as MajorDayChoice[] | null) || []
      setSchedule(mine)
      setChoices(Object.fromEntries(mine.map((choice) => [choice.play_day_id, choice.time_slot_id])))
    }
    setMessage(eventResult.error?.message || entryResult.error?.message || dayResult.error?.message || slotResult.error?.message || "")
    setCurrentTime(Date.now())
    setLoading(false)
  }, [slug, vipEntry])

  useEffect(() => {
    // Initial client-side Supabase synchronization for the route parameter.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEvent()
  }, [loadEvent])

  useEffect(() => {
    const clock = window.setInterval(() => setCurrentTime(Date.now()), 60_000)
    return () => window.clearInterval(clock)
  }, [])

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
  const mgaOpen = event.slug.trim().toLowerCase() === "major-2" || event.name.trim().toLowerCase().includes("mga open")
  const displayDescription = mgaOpen ? "The MGA Open — Four rounds, November 12–15, 2026." : event.description
  const dayLabels = mgaOpen ? MGA_DAY_LABELS : MASTERS_DAY_LABELS
  const testEvent = event.is_test_event
  const signupState = signupStatus?.state || (event.signup_open ? "open" : "closed")
  const signupBadge = mgaOpen
    ? vipEntry && signupState === "priority" ? "VIP REGISTRATION OPEN" : signupState === "upcoming" ? "" : `Signup ${signupState}`
    : signupState === "priority" ? "Priority registration" : `Signup ${signupState}`
  const signupBadgeState = signupState === "priority" ? "priority" : signupState
  const showSignupControls = !mgaOpen || event.signup_open || schedule.length > 0
  const canSubmitSignup = !mgaOpen || signupState === "open" || signupState === "priority"
  // The personalized server check gates VIP-only submission on the unlisted entry point.
  // The RPC remains the source of truth for final eligibility and signup.
  const signupDisabled = schedule.length > 0
    ? !event.signup_open
    : !canSubmitSignup
  const canChooseSlots = !signupDisabled || siteAdmin
  const weekendStatus = schedule[0]?.weekend_competition_status || "pending"
  const secondaryFieldName = event.secondary_trophy_display_name || "Secondary Trophy Field"
  const localTimeZone = displayTimeZone.timeZone
  const generalRegistrationMessage = mgaOpen ? `General registration opens ${formatMgaPublicOpening(signupStatus?.public_signup_opens_at || null)}.` : `Public signup opens ${formatMajorLocalDateTime(signupStatus?.public_signup_opens_at || null, localTimeZone)}.`
  const allFourSelected = days.length === 4 && days.every((day) => Boolean(choices[day.id]))
  const currentSignupStep = schedule.length > 0 ? 3 : reviewing ? 2 : 1
  const publishedRooms = days
    .map((day) => ({ day, assignment: schedule.find((choice) => choice.play_day_id === day.id) }))
    .filter(({ assignment }) => Boolean(assignment?.group_label))
  const orderedSlots = days.flatMap((day) => slots.filter((slot) => slot.play_day_id === day.id).sort((left, right) => left.starts_at.localeCompare(right.starts_at)))
  const slotNumbers = new Map(orderedSlots.map((slot, index) => [slot.id, index + 1]))

  return <main className={`${styles.page} ${masters ? styles.masters : mgaOpen ? styles.mga : styles.defaultTheme}`}><div className={styles.atmosphere}>{masters && <div className={styles.mastersScene} aria-hidden="true"><i className={styles.blossomTree} /><i className={styles.bench} /><i className={styles.putter} /><i className={styles.golfBall} /><i className={styles.golfBallTwo} /></div>}</div><div className={styles.container}>
    <Link href="/majors" className={styles.backLink}>← Four Majors</Link>
    {testEvent && <div className={styles.testBanner}><strong>TEST EVENT</strong><span>TEST DATA — NOT OFFICIAL</span></div>}
    <header className={styles.hero}>
      <nav className={styles.signupProgress} aria-label="Signup progress">
        {SIGNUP_STEPS.map((step, index) => {
          return <span key={step} className={index <= currentSignupStep ? styles.progressActive : ""}><b>{index + 1}</b>{step}</span>
        })}
      </nav>
      <section className={styles.majorsIntro}>
        <h1>WELCOME TO THE FOUR MAJORS</h1>
        <p className={styles.majorNames}>The Masters <i>·</i> The PGA <i>·</i> The U.S. Open <i>·</i> The Open Championship</p>
        <p className={styles.miniGolfStyle}>MINI GOLF STYLE</p>
        <p>In traditional major-championship style, each Major will be played over four rounds of golf — Thursday, Friday, Saturday, and Sunday.</p>
        <p>Choose your preferred playing time for each round below.</p>
        <strong className={styles.aspirational}>WHO WILL BE THE FIRST TO WIN ALL FOUR?</strong>
      </section>
      <div className={`${styles.brandRow} ${mgaOpen ? styles.mgaBrandRow : ""}`}><Image src="/league-media/BIG LOGO TRANSPARENT.png" width={136} height={136} alt="Krys Leagues" className={styles.logo} priority /><div><h2 className={styles.eventTitle}>{testEvent ? "TEST EVENT" : masters ? "THE MASTERS" : event.name}</h2><p className={styles.eventIdentity}>{testEvent ? "TEST DATA — NOT OFFICIAL" : masters ? "MINI GOLF MASTERS" : "MAJOR CHAMPIONSHIP"}</p><p className={styles.subtitle}>{testEvent ? "The real Major workflow, rehearsed safely" : masters ? "CHERRY BLOSSOM" : mgaOpen ? "GARDENS OF BABYLON" : "Four-round mini golf championship"}</p>{mgaOpen && <p className={styles.headerDescription}>{displayDescription}</p>}</div>{mgaOpen && <Image src="/approved-pages/mga-cup.png" width={2064} height={2752} alt="MGA Cup trophy" className={styles.mgaCup} priority />}</div>
      {masters && <div className={styles.mastersFeature} role="img" aria-label="Cherry Blossom course artwork from the Masters scorecard"><div className={styles.featureSheen} /></div>}
      <div className={styles.statusRow}><span className={styles.badge}>{event.status}</span>{signupBadge && <span className={`${styles.badge} ${styles[signupBadgeState]}`}>{signupBadge}</span>}<span className={styles.capacity}>{signupStatus?.capacity ? `${signupStatus.spots_claimed} / ${signupStatus.capacity} spots claimed` : `${entries.length} claimed · field capacity not set`}</span></div>
      {!mgaOpen && <p className={styles.meta}>{event.year || "Year to be announced"} · {formatMajorLocalDateTime(event.starts_at, localTimeZone)}</p>}
      {!mgaOpen && displayDescription && <p className={styles.description}>{displayDescription}</p>}
      {mgaOpen && <strong className={styles.allSkillLevels}>ALL SKILL LEVELS WELCOME!</strong>}
      {!mgaOpen && <section className={styles.commitmentCard}>
        <p className={styles.eyebrow}>You are signing up to play four rounds</p>
        <h2>One 18-hole round each day</h2>
        <div className={styles.roundList}>{dayLabels.map((day) => <p key={day.day}><strong>{day.day} — {day.round}</strong><span>{day.course}</span></p>)}</div>
        <p>Everyone plays Thursday and Friday. After Friday, the field is divided for the weekend.</p>
        <p>Players who do not make the Main field are <strong>not eliminated from the Major.</strong> They continue Saturday and Sunday in the Secondary field for its separate trophy.</p>
      </section>}
      {(mgaOpen || event.signup_open || schedule.length > 0) && <section className={styles.signupCard}>
        {mgaOpen && <>
          <p className={styles.eyebrow}>YOU ARE SIGNING UP FOR THE MGA OPEN</p>
          <p className={styles.mgaExplanation}>The MGA Open is our second Major Championship, played over four rounds in a PGA-style format.</p>
          <p className={styles.mgaExplanation}>Choose your preferred playing time for each round.</p>
        </>}
        {showSignupControls && <MajorTimeZoneControl key={`${displayTimeZone.timeZone}:${displayTimeZone.source}`} {...displayTimeZone} />}
        {schedule.length > 0 && <p className={styles.assignment}>{event.weekend_status_published_at ? <>Weekend status: <strong>{weekendStatus === "main" ? "Masters Main Event" : weekendStatus === "secondary" ? secondaryFieldName : "Weekend field status pending"}</strong></> : <strong>Weekend field status pending</strong>}</p>}
        {signupState === "upcoming" && <p className={styles.notice}>{generalRegistrationMessage}</p>}
        {vipEntry && !authenticated && <p className={styles.notice}>Sign in with Discord to check VIP registration eligibility.<button type="button" onClick={signIn} className={styles.secondaryButton}>SIGN IN WITH DISCORD</button></p>}
        {vipEntry && authenticated && signupState === "upcoming" && <p className={styles.notice}>VIP registration is not available for this account. {generalRegistrationMessage}</p>}
        {signupState === "priority" && <p className={styles.notice}>{mgaOpen ? <>VIP REGISTRATION OPEN. {generalRegistrationMessage}</> : generalRegistrationMessage}</p>}
        {signupState === "full" && schedule.length === 0 && <p className={styles.notice}>The current field is full.</p>}
        {showSignupControls && <>
        {days.length !== 4 ? <p className={styles.notice}>Tournament staff is still configuring the four-day schedule.</p> : <div className={styles.days}>{days.map((day) => {
          const mine = schedule.find((choice) => choice.play_day_id === day.id)
          const daySlots = slots.filter((slot) => slot.play_day_id === day.id)
          const savedSlot = mine ? daySlots.find((slot) => slot.id === mine.time_slot_id) : undefined
          const locked = savedSlot ? isMajorSlotMoveOutLocked(savedSlot.starts_at, currentTime) : false
          const savedSlotHasBegun = savedSlot ? isMajorSlotStarted(savedSlot.starts_at, currentTime) : false
           const dayName = dayLabels[day.day_number - 1]
          return <fieldset key={day.id} className={styles.dayCard} disabled={locked || !canChooseSlots}>
            <legend><span>{dayName.day}</span>{dayName.round}</legend><p className={styles.dayContext}>Official round date: {formatPlayDate(day.play_date)}{mgaOpen ? ` · ${dayName.course}` : ""}</p>
            {daySlots.length ? <div className={styles.slotPicker}><label className={styles.slotPickerLabel} htmlFor={`slot-${day.id}`}>Choose Your Time Slot</label><select id={`slot-${day.id}`} className={styles.slotSelect} value={choices[day.id] || ""} onChange={(selection) => { setChoices((old) => ({ ...old, [day.id]: selection.target.value })); setReviewing(false) }}><option value="">Select an available time…</option>{daySlots.map((slot) => { const dateShift = mgaOpen ? "" : localDateShift(day.play_date, slot.starts_at, localTimeZone); const started = isMajorSlotStarted(slot.starts_at, currentTime); const selected = choices[day.id] === slot.id; return <option key={slot.id} value={slot.id} disabled={started && !selected}>Time Slot {slotNumbers.get(slot.id) || "—"} · {formatMajorLocalDate(slot.starts_at, localTimeZone)} · {formatMajorLocalTimeWithZone(slot.starts_at, localTimeZone)}{dateShift ? ` · ${dateShift}` : ""}{started && !selected ? " · passed" : ""}</option> })}</select>{choices[day.id] && (() => { const selectedSlot = daySlots.find((slot) => slot.id === choices[day.id]); return selectedSlot ? <p className={styles.selectedTime}><strong>Selected: Time Slot {slotNumbers.get(selectedSlot.id) || "—"}</strong><span>{formatMajorLocalDate(selectedSlot.starts_at, localTimeZone)} · {formatMajorLocalTimeWithZone(selectedSlot.starts_at, localTimeZone)}</span></p> : null })()}</div> : <p className={styles.notice}>No times available yet.</p>}
            {!mgaOpen && <p className={styles.lockDeadline}>Player time changes lock individually 12 hours before the selected slot starts.<span>{localTimeZone}</span></p>}
            {locked && <p className={styles.locked}>{savedSlotHasBegun ? "Selected time has started" : "Selected time is locked — tournament admins can still help"}</p>}
          </fieldset>
        })}</div>}
        {days.length === 4 && !reviewing && <button onClick={() => setReviewing(true)} disabled={saving || !canChooseSlots || !allFourSelected} className={styles.primaryButton}>{schedule.length ? "REVIEW MY UPDATED TIMES" : "REVIEW MY 4 DAY SIGNUP"}</button>}
        </>}
        {showSignupControls && reviewing && <section className={styles.signupReview}><p className={styles.eyebrow}>You’re almost in</p><h3>Confirm your four playing times</h3><div>{days.map((day) => {
          const slot = slots.find((item) => item.id === choices[day.id])
           return <p key={day.id}><span>{dayLabels[day.day_number - 1].day}</span><strong>{slot ? <>{formatMajorLocalDate(slot.starts_at, localTimeZone)}<small>{formatMajorLocalTimeWithZone(slot.starts_at, localTimeZone)}</small></> : "Not selected"}</strong></p>
        })}</div><p className={styles.reviewHelp}>These are preferred scheduling times. Each saved slot independently locks player move-out 12 hours before it starts; a new slot must not have started.</p><div className={styles.reviewActions}><button type="button" className={styles.secondaryButton} onClick={() => setReviewing(false)}>Change a time</button><button type="button" onClick={signup} disabled={saving || signupDisabled || !allFourSelected} className={styles.primaryButton}>{saving ? "Saving…" : schedule.length ? "CONFIRM UPDATED TIMES" : testEvent ? "CONFIRM MY TEST ENTRY" : masters ? "CONFIRM MY MASTERS ENTRY" : "CONFIRM MY MAJOR ENTRY"}</button></div></section>}
      {publishedRooms.length > 0 && <section className={styles.roomSection}><p className={styles.eyebrow}>Your published rooms</p><h3>Who you’re playing with</h3><div className={styles.roomGrid}>{publishedRooms.map(({ day, assignment }) => assignment && <article key={day.id} className={styles.roomCard}><header><span>{dayLabels[day.day_number - 1].day}</span><strong>{dayLabels[day.day_number - 1].round}</strong></header><p className={styles.roomTime}>{assignment.starts_at ? formatMajorLocalDateTime(assignment.starts_at, localTimeZone) : "Time pending"}<small>{localTimeZone}</small></p><h4>{assignment.group_label}</h4><div className={styles.roomRoster}>{assignment.room_roster?.map((member) => <span key={member.player_id}>{member.player_screen_name_snapshot}</span>)}</div>{assignment.assignment_location && <div className={styles.roomDetail}><small>Course / lobby</small><strong>{assignment.assignment_location}</strong></div>}{assignment.group_instructions && <div className={styles.roomDetail}><small>Instructions</small><p>{assignment.group_instructions}</p></div>}</article>)}</div></section>}
      </section>}
      {message && <p className={styles.notice}>{message}</p>}
    </header>
    {[event.scheduling_instructions,event.qualifier_information,event.cut_information,event.weekend_information,event.room_rules,event.stream_information].some(Boolean) && <section className={styles.contentCard}><h2>Tournament information</h2>
      {event.scheduling_instructions && <InfoBlock title="Scheduling" body={event.scheduling_instructions} />}
      {event.qualifier_information && <InfoBlock title="Rounds 1 and 2" body={event.qualifier_information} />}
      {event.cut_information && <InfoBlock title="Friday cut" body={event.cut_information} />}
      {event.weekend_information && <InfoBlock title="Weekend fields" body={event.weekend_information} />}
      {event.room_rules && <InfoBlock title="Room and play rules" body={event.room_rules} />}
      {event.stream_information && <InfoBlock title="Stream information" body={event.stream_information} />}
    </section>}
    {(event.stream_url || event.stream_scheduled_at) && <section className={styles.contentCard}><h2>Official broadcast</h2>{event.stream_is_live && <p className={styles.live}>● Live now</p>}<p className={styles.meta}>{event.stream_label || event.stream_platform || "Major broadcast"}</p>{event.stream_url && <a href={event.stream_url} target="_blank" rel="noreferrer" className={styles.streamLink}>Watch official stream ↗</a>}</section>}
    <section className={styles.contentCard}><h2>{testEvent ? "TEST field" : "Championship field"} <span>{entries.length}</span></h2>{entries.length === 0 ? <p className={styles.meta}>No public participants yet.</p> : <div className={styles.entrantGrid}>{entries.map((entry) => <div key={entry.roster_position} className={styles.entrant}><strong>{entry.player_screen_name_snapshot}</strong><span>{entry.status}</span></div>)}</div>}</section>
  </div></main>
}

function InfoBlock({ title, body }: { title: string; body: string }) {
  return <div><h3>{title}</h3><p className={styles.description}>{body}</p></div>
}

const MASTERS_DAY_LABELS = [
  { day: "Thursday", round: "Round 1", course: "Cherry Blossom Easy" },
  { day: "Friday", round: "Round 2", course: "Cherry Blossom Easy" },
  { day: "Saturday", round: "Round 3", course: "Cherry Blossom Hard" },
  { day: "Sunday", round: "Final Round", course: "Cherry Blossom Hard" },
] as const

const MGA_DAY_LABELS = [
  { day: "Thursday", round: "Round 1", course: "Gardens of Babylon Easy" },
  { day: "Friday", round: "Round 2", course: "Gardens of Babylon Easy" },
  { day: "Saturday", round: "Round 3", course: "Gardens of Babylon Hard" },
  { day: "Sunday", round: "Final Round", course: "Gardens of Babylon Hard" },
] as const

const SIGNUP_STEPS = ["Learn about the Major", "Choose 4 times", "Review", "Registered"] as const

function formatPlayDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`))
}

function formatMgaPublicOpening(value: string | null) {
  if (!value) return "the public opening date to be announced"
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" }).format(new Date(value))
}

function localDateShift(playDate: string, startsAt: string, timeZone: string) {
  const localDate = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(new Date(startsAt))
  if (localDate > playDate) return "Next day locally"
  if (localDate < playDate) return "Previous day locally"
  return ""
}
