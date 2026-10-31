"use client"

import Link from "next/link"
import Image from "next/image"
import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { isMajorDayLocked, isMastersScorecardTheme, type MajorDayChoice, type MajorEntry, type MajorEvent, type MajorPlayerScoringRound, type MajorPlayDay, type MajorPublishedRoom, type MajorSignupStatus, type MajorTimeSlot, type MajorWaitlistStatus } from "@/lib/majors"
import { createDiscordAuthCallbackUrl } from "@/lib/authReturnTo"
import { getAuthenticatedDiscordName } from "@/lib/discordPlayerLogin"
import { mastersRoundAccessState, nextMastersScoreAccessTransition, sortMastersPublishedRooms, visibleMastersScoringRounds } from "@/lib/mastersPlayerExperience"
import { formatMastersAdminTime, formatMastersPlayerDateTime, formatMastersPlayerSlot, meaningfulMajorSlotLabel, PLAYER_LOCAL_TIME_HEADING } from "@/lib/mastersSignupDisplay"
import { supabase } from "@/lib/supabase"
import MastersOfficialRules from "@/components/majors/MastersOfficialRules"
import styles from "./page.module.css"

export default function MajorDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const [event, setEvent] = useState<MajorEvent | null>(null)
  const [entries, setEntries] = useState<MajorEntry[]>([])
  const [days, setDays] = useState<MajorPlayDay[]>([])
  const [slots, setSlots] = useState<MajorTimeSlot[]>([])
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [schedule, setSchedule] = useState<MajorDayChoice[]>([])
  const [waitlistStatus, setWaitlistStatus] = useState<MajorWaitlistStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [signupStatus, setSignupStatus] = useState<MajorSignupStatus | null>(null)
  const [playerResolution, setPlayerResolution] = useState<"matched" | "no_match" | "conflict" | null>(null)
  const [allPublishedRooms, setAllPublishedRooms] = useState<MajorPublishedRoom[]>([])
  const [scoringRounds, setScoringRounds] = useState<MajorPlayerScoringRound[]>([])
  const [playerPanel, setPlayerPanel] = useState<"rooms" | "rules" | null>(null)
  const [roomListRound, setRoomListRound] = useState<number>(1)
  const [scoreAccessMessage, setScoreAccessMessage] = useState("")
  const [currentTime, setCurrentTime] = useState(0)

  const loadEvent = useCallback(async () => {
    const eventResult = await supabase.from("major_events").select("*").eq("slug", slug).maybeSingle()
    const loadedEvent = eventResult.data as MajorEvent | null
    setEvent(loadedEvent)
    if (!loadedEvent) { setMessage(eventResult.error?.message || "This Major is not available."); setLoading(false); return }
    const [entryResult, dayResult, roomResult] = await Promise.all([
      supabase.from("major_entries").select("*").eq("major_event_id", loadedEvent.id).order("registered_at"),
      supabase.from("major_play_days").select("*").eq("major_event_id", loadedEvent.id).order("day_number"),
      supabase.rpc("get_public_major_published_rooms", { p_major_event_id: loadedEvent.id }),
    ])
    const loadedDays = (dayResult.data as MajorPlayDay[] | null) || []
    const dayIds = loadedDays.map((day) => day.id)
    const slotResult = dayIds.length ? await supabase.from("major_time_slots").select("*").in("play_day_id", dayIds).eq("is_available", true).order("starts_at") : { data: [], error: null }
    const statusResult = await supabase.rpc("get_major_signup_status", { p_major_event_id: loadedEvent.id })
    setEntries((entryResult.data as MajorEntry[] | null) || [])
    setDays(loadedDays)
    setSlots((slotResult.data as MajorTimeSlot[] | null) || [])
    setSignupStatus(statusResult.data as MajorSignupStatus | null)
    const loadedRooms = sortMastersPublishedRooms((roomResult.data as MajorPublishedRoom[] | null) || [])
    setAllPublishedRooms(loadedRooms)
    setRoomListRound((current) => loadedRooms.some((room) => room.day_number === current)
      ? current
      : loadedRooms.find((room) => room.is_my_room)?.day_number || loadedRooms[0]?.day_number || 1)
    const user = await supabase.auth.getUser()
    if (user.data.user) {
      const [result, waitlistResult, resolutionResult, scoringResult] = await Promise.all([
        supabase.rpc("get_my_major_signup_schedule", { p_major_event_id: loadedEvent.id }),
        supabase.rpc("get_major_waitlist_status", { p_major_event_id: loadedEvent.id }),
        supabase.rpc("resolve_current_discord_player_login"),
        supabase.rpc("get_my_major_scorecards", { p_major_event_id: loadedEvent.id }),
      ])
      const mine = (result.data as MajorDayChoice[] | null) || []
      setSchedule(mine)
      setChoices(Object.fromEntries(mine.map((choice) => [choice.play_day_id, choice.time_slot_id])))
      setWaitlistStatus((waitlistResult.data as MajorWaitlistStatus | null) || null)
      setScoringRounds((scoringResult.data as MajorPlayerScoringRound[] | null) || [])
      const resolution = Array.isArray(resolutionResult.data) ? resolutionResult.data[0] : resolutionResult.data
      setPlayerResolution((resolution?.resolution_status as "matched" | "no_match" | "conflict" | undefined) || null)
    } else {
      setWaitlistStatus(null)
      setPlayerResolution(null)
      setScoringRounds([])
    }
    setMessage(eventResult.error?.message || entryResult.error?.message || dayResult.error?.message || slotResult.error?.message || roomResult.error?.message || "")
    setCurrentTime(Date.now())
    setLoading(false)
  }, [slug])

  useEffect(() => {
    // Initial client-side Supabase synchronization for the route parameter.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEvent()
  }, [loadEvent])

  useEffect(() => {
    const transition = nextMastersScoreAccessTransition(scoringRounds, currentTime)
    if (transition === null) return
    const clock = window.setTimeout(() => setCurrentTime(Date.now()), Math.max(25, transition - currentTime + 25))
    return () => window.clearTimeout(clock)
  }, [currentTime, scoringRounds])

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
    const useWaitlist = event.slug === "masters" && signupStatus?.state === "full"
    if (playerResolution === "conflict") { setSaving(false); setMessage("This Discord identity needs administrator review before registration."); return }
    const newPlayerName = playerResolution === "no_match" ? getAuthenticatedDiscordName(user.data.user) : null
    if (playerResolution === "no_match" && !newPlayerName) { setSaving(false); setMessage("Your Discord identity did not provide a usable player name. Contact an administrator before registering."); return }
    const result = await supabase.rpc("join_major_with_new_discord_player", {
      p_major_event_id: event.id,
      p_time_slot_ids: selected,
      p_screen_name: newPlayerName,
      p_join_waitlist: useWaitlist,
    })
    setSaving(false)
    if (result.error) { setMessage(result.error.message); return }
    setMessage(useWaitlist ? "You are on the Masters wait list and your preferred times are saved." : "You are registered and all four day choices are saved.")
    setReviewing(false)
    await loadEvent()
  }

  function openRoundScores(round: MajorPlayerScoringRound) {
    const state = mastersRoundAccessState(round, currentTime)
    if (state === "upcoming" && round.room_start_at) {
      const opening = formatMastersPlayerSlot(round.room_start_at, round.play_date, Intl.DateTimeFormat().resolvedOptions().timeZone || event?.schedule_timezone || "America/New_York")
      setScoreAccessMessage(`YOUR ROUND ${round.day_number} ROOM HAS NOT STARTED YET. Score entry opens at ${opening.date}, ${opening.time}.`)
      return
    }
    if (state === "closed") {
      setScoreAccessMessage(`ROUND ${round.day_number} SCORE ENTRY IS CLOSED.`)
      return
    }
    if (state !== "open") return
    router.push(`/majors/${slug}/scoring?round=${round.day_number}&playDayId=${encodeURIComponent(round.play_day_id)}`)
  }

  if (loading) return <main className={styles.loading}>Loading Major…</main>
  if (!event) return <main className={styles.loading}><Link href="/majors">← Four Majors</Link>{slug === "test" ? <><h1>TEST EVENT</h1><p>Authenticated trusted-tester access is required. TEST DATA — NOT OFFICIAL.</p><button onClick={signIn} className={styles.primaryButton}>Sign in with Discord</button></> : <p>{message}</p>}</main>

  const masters = isMastersScorecardTheme(event)
  const testEvent = event.is_test_event
  const signupState = signupStatus?.state || (event.signup_open ? "open" : "closed")
  const waitlistAvailable = masters && signupState === "full" && !waitlistStatus?.entry_id
  const signupDisabled = schedule.length > 0 ? !event.signup_open : !(signupState === "open" || signupState === "priority" || waitlistAvailable)
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || event.schedule_timezone || "America/New_York"
  const allFourSelected = days.length === 4 && days.every((day) => Boolean(choices[day.id]))
  const currentSignupStep = schedule.length > 0 ? 3 : reviewing ? 2 : 1
  const publishedRooms = days
    .map((day) => ({ day, assignment: schedule.find((choice) => choice.play_day_id === day.id) }))
    .filter(({ assignment }) => Boolean(assignment?.group_label))
  const infoBlocks = (masters ? [
    { title: "Scheduling", body: event.scheduling_instructions },
    { title: "Four-round championship", body: "Every Masters player remains in the championship for all four rounds. Each saved round and room assignment remains intact." },
  ] : [
    { title: "Scheduling", body: event.scheduling_instructions },
    { title: "Rounds 1 and 2", body: event.qualifier_information },
    { title: "Friday cut", body: event.cut_information },
    { title: "Weekend fields", body: event.weekend_information },
    { title: "Room and play rules", body: event.room_rules },
    { title: "Stream information", body: event.stream_information },
  ]).filter((block): block is { title: string; body: string } => Boolean(block.body))

  return <main className={`${styles.page} ${masters ? styles.masters : styles.defaultTheme}`}><div className={styles.atmosphere}>{masters && <div className={styles.mastersScene} aria-hidden="true"><i className={styles.blossomTree} /><i className={styles.bench} /></div>}</div><div className={styles.container}>
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
        <p className={styles.majorNames}>{masters ? <>THE MINI-GOLF MASTERS <i>*</i> THE MGA <i>*</i> THE MINI-GOLF OPEN <i>*</i> THE MINI-GOLF CHAMPIONSHIP</> : <>The Masters <i>·</i> The PGA <i>·</i> The U.S. Open <i>·</i> The Open Championship</>}</p>
        <p className={styles.miniGolfStyle}>MINI GOLF STYLE</p>
        <p>In traditional major-championship style, each Major will be played over four rounds of golf — Thursday, Friday, Saturday, and Sunday.</p>
        <p>Choose your preferred playing time for each round below.</p>
        <strong className={styles.aspirational}>WHO WILL BE THE FIRST TO WIN ALL FOUR?</strong>
      </section>
      <div className={styles.brandRow}><Image src="/league-media/BIG LOGO TRANSPARENT.png" width={136} height={136} alt="Krys Leagues" className={styles.logo} priority /><div><h2 className={styles.eventTitle}>{testEvent ? "TEST EVENT" : masters ? "THE MASTERS" : event.name}</h2><p className={styles.eventIdentity}>{testEvent ? "TEST DATA — NOT OFFICIAL" : masters ? "MINI GOLF MASTERS" : "MAJOR CHAMPIONSHIP"}</p><p className={styles.subtitle}>{testEvent ? "The real Major workflow, rehearsed safely" : masters ? "CHERRY BLOSSOM" : "Four-round mini golf championship"}</p></div></div>
      {masters && <div className={styles.mastersFeature}><Image src="/approved-pages/the masters.jpg" alt="Cherry blossom Masters course artwork" fill sizes="(max-width: 700px) 100vw, 1036px" className={styles.mastersBanner} priority /><div className={styles.featureSheen} /></div>}
      {masters && <section className={styles.playerActionArea} aria-label="Masters player actions">
        <div className={styles.coreActions}>
          <button type="button" onClick={() => { setPlayerPanel("rooms"); setScoreAccessMessage("") }}>VIEW MASTERS ROOMS</button>
          <button type="button" onClick={() => { setPlayerPanel("rules"); setScoreAccessMessage("") }}>MASTERS RULES</button>
          <button type="button" onClick={() => router.push(`/majors/${slug}/results`)}>MASTERS LIVE SCORE TRACKER</button>
        </div>
        {visibleMastersScoringRounds(scoringRounds, currentTime).length > 0 && <div className={styles.roundScoreActions}>
          {visibleMastersScoringRounds(scoringRounds, currentTime).map((round) => {
            const state = mastersRoundAccessState(round, currentTime)
            return <button key={round.play_day_id} type="button" disabled={state === "closed"} className={state === "open" ? styles.scoreOpen : state === "closed" ? styles.scoreClosed : styles.scoreUpcoming} onClick={() => openRoundScores(round)}>{state === "closed" ? `ROUND ${round.day_number} CLOSED` : `ROUND ${round.day_number} SCORES`}</button>
          })}
        </div>}
        {scoreAccessMessage && <p className={styles.scoreAccessMessage} role="status">{scoreAccessMessage}</p>}
        {playerPanel === "rules" && <section className={styles.playerPanel} id="masters-rules"><header><div><p className={styles.eyebrow}>Event-wide</p><h2>MASTERS RULES</h2></div><button type="button" onClick={() => setPlayerPanel(null)} aria-label="Close Masters rules">Close</button></header><MastersOfficialRules className={styles.rulesText} /></section>}
        {playerPanel === "rooms" && <section className={styles.playerPanel} id="masters-rooms"><header><div><p className={styles.eyebrow}>Complete published rooms</p><h2>MASTERS ROOMS</h2></div><button type="button" onClick={() => setPlayerPanel(null)} aria-label="Close Masters rooms">Close</button></header><nav className={styles.roomRoundTabs} aria-label="Masters room rounds">{days.map((day) => <button key={day.id} type="button" className={roomListRound === day.day_number ? styles.activeRoomRound : ""} onClick={() => setRoomListRound(day.day_number)}>ROUND {day.day_number}</button>)}</nav><div className={styles.allRoomsGrid}>{allPublishedRooms.filter((room) => room.day_number === roomListRound).map((room) => <article key={room.group_id} className={`${styles.allRoomCard} ${room.is_my_room ? styles.myRoom : ""}`}><header><h3>{room.group_label}</h3>{room.is_my_room && <span>YOUR ROOM</span>}</header><p className={styles.eventRoomTime}>{formatMastersAdminTime(room.starts_at, event.schedule_timezone)}</p><div className={styles.roomRoster}>{room.roster.map((member) => <span key={member.player_id}>{member.player_screen_name_snapshot}</span>)}</div></article>)}</div>{!allPublishedRooms.some((room) => room.day_number === roomListRound) && <p className={styles.notice}>No complete published rooms are available for this round yet.</p>}</section>}
      </section>}
      <div className={styles.statusRow}><span className={styles.badge}>{event.status}</span><span className={`${styles.badge} ${styles[signupState]}`}>Signup {signupState}</span><span className={styles.capacity}>{signupStatus?.capacity ? `${signupStatus.spots_claimed} / ${signupStatus.capacity} spots claimed` : `${entries.length} claimed · field capacity not set`}</span></div>
      <p className={styles.meta}>{event.year || "Year to be announced"} · {event.starts_at ? formatMastersPlayerDateTime(event.starts_at, localTimeZone) : "To be announced"}</p>
      {event.description && <p className={styles.description}>{event.description}</p>}
      <section className={styles.commitmentCard}>
        <p className={styles.eyebrow}>You are signing up to play four rounds</p>
        <h2>One 18-hole round each day</h2>
        <div className={styles.roundList}>{DAY_LABELS.map((day) => <p key={day.day}><strong>{day.day} — {day.round}</strong><span>{day.course}</span></p>)}</div>
        <p>Every Masters player plays all four scheduled rounds.</p>
      </section>
      {(event.signup_open || schedule.length > 0) && <section className={styles.signupCard}>
        <p className={styles.eyebrow}>Your job right now</p>
        <h2>Choose one preferred playing time for each of the four rounds</h2>
        <p className={styles.signupExplainer}>Your Thursday, Friday, Saturday, and Sunday choices are independent. You do not have to choose the same time every day. Room assignments are made later.</p>
        <p className={styles.timezone}><strong>All dates and times below are shown in your local time.</strong></p>
        {event.signup_instructions && <p className={styles.description}>{event.signup_instructions}</p>}
        {playerResolution === "no_match" && <p className={styles.notice}>Your Discord name will be used as your initial Krys Leagues screen name for this entry.</p>}
        <p className={styles.cutNotice}>Choose one independent time for Thursday, Friday, Saturday, and Sunday. Every saved round time remains intact.</p>
        {signupState === "upcoming" && <p className={styles.notice}>Public signup opens {signupStatus?.public_signup_opens_at ? formatMastersPlayerDateTime(signupStatus.public_signup_opens_at, localTimeZone) : "at a time to be announced"}. Priority access is not active for this first Major.</p>}
        {signupState === "priority" && <p className={styles.notice}>Priority signup is open for eligible previous-Major players. Public signup opens {signupStatus?.public_signup_opens_at ? formatMastersPlayerDateTime(signupStatus.public_signup_opens_at, localTimeZone) : "at a time to be announced"}.</p>}
        {signupState === "full" && schedule.length === 0 && !waitlistStatus?.entry_id && <p className={styles.notice}>The current field is full. Choose preferred times below to join the wait list.</p>}
        {waitlistStatus?.state === "waiting" && <p className={styles.notice}>You are on the Masters wait list — position {waitlistStatus.position || "pending"}. Your preferred times are saved.</p>}
        {waitlistStatus?.state === "promoted" && <p className={styles.notice}>Your Masters wait-list entry was promoted to the confirmed field.</p>}
        {days.length !== 4 ? <p className={styles.notice}>Tournament staff is still configuring the four-day schedule.</p> : <div className={styles.days}>{days.map((day) => {
          const mine = schedule.find((choice) => choice.play_day_id === day.id)
          const daySlots = slots.filter((slot) => slot.play_day_id === day.id)
          const locked = mine?.is_locked ?? isMajorDayLocked(day)
          const firstScheduledTime = daySlots.reduce<string | null>((earliest, slot) => !earliest || slot.starts_at < earliest ? slot.starts_at : earliest, null)
          const firstScheduledTimeHasBegun = firstScheduledTime ? currentTime >= new Date(firstScheduledTime).getTime() : false
          const dayName = DAY_LABELS[day.day_number - 1]
          return <fieldset key={day.id} className={styles.dayCard} disabled={locked || signupDisabled}>
            <legend><span>{dayName.day}</span>{dayName.round}</legend><p className={styles.dayContext}>Official round date: {formatPlayDate(day.play_date)}</p>
            <p className={styles.availabilityNote}>{PLAYER_LOCAL_TIME_HEADING}</p>
            {daySlots.length ? daySlots.map((slot) => {
              const localSlot = formatMastersPlayerSlot(slot.starts_at, day.play_date, localTimeZone)
              const slotLabel = meaningfulMajorSlotLabel(slot.label)
              return <label key={slot.id} className={`${styles.slotLabel} ${choices[day.id] === slot.id ? styles.selected : ""}`}><input type="radio" name={day.id} checked={choices[day.id] === slot.id} onChange={() => { setChoices((old) => ({ ...old, [day.id]: slot.id })); setReviewing(false) }} /><span className={styles.localDateTime}>{slotLabel && <span className={styles.slotDescriptor}>{slotLabel}</span>}<strong>{localSlot.date}</strong><b>{localSlot.time}</b>{localSlot.dayShift && <em>{localSlot.dayShift}</em>}</span></label>
            }) : <p className={styles.notice}>No times available yet.</p>}
            <p className={styles.lockDeadline}>{dayName.day} selections lock:<strong>{day.selection_locks_at ? formatMastersPlayerDateTime(day.selection_locks_at, localTimeZone) : "Deadline appears after the first time is scheduled"}</strong><span>Local time</span></p>
            {locked && <p className={styles.locked}>{firstScheduledTimeHasBegun ? "Selection locked" : "Selection locked — tournament admins can still help"}</p>}
          </fieldset>
        })}</div>}
        {days.length === 4 && !reviewing && !waitlistStatus?.entry_id && <button onClick={() => setReviewing(true)} disabled={saving || signupDisabled || !allFourSelected} className={styles.primaryButton}>{schedule.length ? "REVIEW MY UPDATED TIMES" : waitlistAvailable ? "REVIEW MY WAIT-LIST TIMES" : "REVIEW MY 4 DAY SIGNUP"}</button>}
        {reviewing && <section className={styles.signupReview}><p className={styles.eyebrow}>{waitlistAvailable ? "Join the queue" : "You’re almost in"}</p><h3>Confirm your four playing times</h3><div>{days.map((day) => {
          const slot = slots.find((item) => item.id === choices[day.id])
          const localSlot = slot ? formatMastersPlayerSlot(slot.starts_at, day.play_date, localTimeZone) : null
          return <p key={day.id}><span>{DAY_LABELS[day.day_number - 1].day}</span><strong>{localSlot ? <>{localSlot.date}<small>{localSlot.time}</small>{localSlot.dayShift && <em>{localSlot.dayShift}</em>}</> : "Not selected"}</strong></p>
        })}</div><p className={styles.reviewHelp}>{waitlistAvailable ? "Your choices are preferences only and do not reserve a confirmed Masters spot." : "These are preferred scheduling times. Each day stays independently editable until that day’s lock deadline."}</p><div className={styles.reviewActions}><button type="button" className={styles.secondaryButton} onClick={() => setReviewing(false)}>Change a time</button><button type="button" onClick={signup} disabled={saving || signupDisabled || !allFourSelected} className={styles.primaryButton}>{saving ? "Saving…" : waitlistAvailable ? "JOIN WAIT LIST" : schedule.length ? "CONFIRM UPDATED TIMES" : testEvent ? "CONFIRM MY TEST ENTRY" : masters ? "CONFIRM MY MASTERS ENTRY" : "CONFIRM MY MAJOR ENTRY"}</button></div></section>}
        {publishedRooms.length > 0 && <section className={styles.roomSection}><p className={styles.eyebrow}>Your published rooms</p><h3>Who you’re playing with</h3><div className={styles.roomGrid}>{publishedRooms.map(({ day, assignment }) => {
          if (!assignment) return null
          const localSlot = assignment.starts_at ? formatMastersPlayerSlot(assignment.starts_at, day.play_date, localTimeZone) : null
          return <article key={day.id} className={styles.roomCard}><header><span>{DAY_LABELS[day.day_number - 1].day}</span><strong>{DAY_LABELS[day.day_number - 1].round}</strong></header><p className={styles.roomTime}>{localSlot ? <>{localSlot.time}<small>{localSlot.date} · Local time</small>{localSlot.dayShift && <em>{localSlot.dayShift}</em>}</> : "Time pending"}</p><h4>{assignment.group_label}</h4><div className={styles.roomRoster}>{assignment.room_roster?.map((member) => <span key={member.player_id}>{member.player_screen_name_snapshot}</span>)}</div>{assignment.assignment_location && <div className={styles.roomDetail}><small>Course / lobby</small><strong>{assignment.assignment_location}</strong></div>}{assignment.group_instructions && <div className={styles.roomDetail}><small>Instructions</small><p>{assignment.group_instructions}</p></div>}</article>
        })}</div></section>}
      </section>}
      {message && <p className={styles.notice}>{message}</p>}
    </header>
    {!masters && infoBlocks.length > 0 && <section className={styles.contentCard}><h2>Tournament information</h2>
      {infoBlocks.map((block) => <InfoBlock key={block.title} title={block.title} body={block.body} />)}
    </section>}
    {masters && infoBlocks.length > 0 && <div className={styles.infoBoxGrid}>
      {infoBlocks.map((block) => <section key={block.title} className={styles.contentCard}><h2>{block.title}</h2><p className={styles.description}>{block.body}</p></section>)}
    </div>}
    {(event.stream_url || event.stream_scheduled_at) && <section className={styles.contentCard}><h2>Official broadcast</h2>{event.stream_is_live && <p className={styles.live}>● Live now</p>}<p className={styles.meta}>{event.stream_label || event.stream_platform || "Major broadcast"}</p>{event.stream_url && <a href={event.stream_url} target="_blank" rel="noreferrer" className={styles.streamLink}>Watch official stream ↗</a>}</section>}
    <section className={styles.contentCard}><h2>{testEvent ? "TEST field" : "Championship field"} <span>{entries.length}</span></h2>{entries.length === 0 ? <p className={styles.meta}>No public participants yet.</p> : <div className={styles.entrantGrid}>{entries.map((entry) => <div key={entry.id} className={styles.entrant}><strong>{entry.player_screen_name_snapshot}</strong><span>{entry.status}</span></div>)}</div>}</section>
  </div></main>
}

function InfoBlock({ title, body }: { title: string; body: string }) {
  return <div><h3>{title}</h3><p className={styles.description}>{body}</p></div>
}

const DAY_LABELS = [
  { day: "Thursday", round: "Round 1", course: "Cherry Blossom Easy" },
  { day: "Friday", round: "Round 2", course: "Cherry Blossom Easy" },
  { day: "Saturday", round: "Round 3", course: "Cherry Blossom Hard" },
  { day: "Sunday", round: "Final Round", course: "Cherry Blossom Hard" },
] as const

const SIGNUP_STEPS = ["Learn about the Major", "Choose 4 times", "Review", "Registered"] as const

function formatPlayDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`))
}
