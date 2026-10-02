"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import MajorRoomScorecardPhoto from "@/components/majors/MajorRoomScorecardPhoto"
import { formatMajorToPar, majorRoundDayLabel, type MajorEvent, type MajorPlayerScoringRound } from "@/lib/majors"
import { mastersCourseForRound, mastersRoundAccessState, mastersScoreTotal, nextMastersScoreAccessTransition, shouldAdvanceMastersHole } from "@/lib/mastersPlayerExperience"
import { formatMastersPlayerSlot } from "@/lib/mastersSignupDisplay"
import { supabase } from "@/lib/supabase"

import styles from "./page.module.css"

export default function MajorPlayerScoringPage() {
  const { slug } = useParams<{ slug: string }>()
  const [event, setEvent] = useState<MajorEvent | null>(null)
  const [rounds, setRounds] = useState<MajorPlayerScoringRound[]>([])
  const [playDayId, setPlayDayId] = useState("")
  const [values, setValues] = useState<string[]>(Array(18).fill(""))
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])

  const load = useCallback(async () => {
    const eventResponse = await supabase.from("major_events").select("*").eq("slug", slug).maybeSingle()
    const loaded = eventResponse.data as MajorEvent | null
    setEvent(loaded)
    if (!loaded) {
      setMessage(eventResponse.error?.message || "Major not found.")
      return
    }

    const user = await supabase.auth.getUser()
    if (!user.data.user) {
      setRounds([])
      setPlayDayId("")
      setCurrentTime(Date.now())
      setMessage("")
      return
    }

    const response = await supabase.rpc("get_my_major_scorecards", { p_major_event_id: loaded.id })
    const cards = (response.data as MajorPlayerScoringRound[] | null) || []
    const query = new URLSearchParams(window.location.search)
    const requestedPlayDayId = query.get("playDayId")
    const requestedRound = Number(query.get("round"))
    const preferred = cards.find((card) => card.play_day_id === requestedPlayDayId)
      || cards.find((card) => card.day_number === requestedRound)
      || cards.find((card) => mastersRoundAccessState(card, Date.now()) === "open")
      || cards.find((card) => card.id)
      || cards[0]

    setRounds(cards)
    if (preferred) setPlayDayId(preferred.play_day_id)
    setCurrentTime(Date.now())
    setMessage(response.error?.message || "")
  }, [slug])

  // Initial authenticated scorecard synchronization.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const transition = nextMastersScoreAccessTransition(rounds, currentTime)
    if (transition === null) return
    const clock = window.setTimeout(() => setCurrentTime(Date.now()), Math.max(25, transition - currentTime + 25))
    return () => window.clearTimeout(clock)
  }, [currentTime, rounds])

  const round = rounds.find((item) => item.play_day_id === playDayId)
  const course = mastersCourseForRound(round?.day_number || 1)
  const accessState = round ? mastersRoundAccessState(round, currentTime) : "hidden"

  useEffect(() => {
    // Inputs intentionally mirror the selected persisted round.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValues(Array.from({ length: 18 }, (_, index) => String(round?.holes?.find((hole) => hole.hole_number === index + 1)?.strokes || "")))
  }, [round])

  const strokes = useMemo(() => mastersScoreTotal(values), [values])
  const scoreToPar = useMemo(() => values.reduce((total, value, index) => {
    const score = Number(value)
    return Number.isFinite(score) && score > 0 ? total + score - course.pars[index] : total
  }, 0), [course.pars, values])
  const completedHoles = values.filter((value) => Number(value) > 0).length
  const editable = accessState === "open" && ["draft", "reopened", null].includes(round?.status ?? null)

  async function save(submit = false) {
    if (!round) return
    setBusy(true)
    setMessage("")
    const holes = values.flatMap((value, index) => Number(value) > 0 ? [{ hole_number: index + 1, strokes: Number(value) }] : [])
    const response = await supabase.rpc("save_my_major_scorecard", { p_play_day_id: round.play_day_id, p_holes: holes })
    if (response.error) {
      setBusy(false)
      setMessage(response.error.message)
      return
    }
    if (submit) {
      const submitted = await fetch("/api/majors/scorecards/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scorecardId: response.data }),
      })
      const submittedBody = await submitted.json().catch(() => null) as null | { error?: string; warning?: string }
      if (!submitted.ok) {
        setBusy(false)
        setMessage(submittedBody?.error || "The scorecard could not be submitted.")
        return
      }
      setMessage(submittedBody?.warning
        ? "Scorecard submitted and awaiting admin verification. The Discord alert will be retried from the verification desk."
        : "Scorecard submitted and awaiting admin verification.")
    } else {
      setMessage("Draft saved. You may keep editing while this round is open.")
    }
    setBusy(false)
    await load()
  }

  function updateHole(index: number, value: string) {
    setValues((current) => current.map((score, scoreIndex) => scoreIndex === index ? value : score))
    if (shouldAdvanceMastersHole(value, index)) {
      window.requestAnimationFrame(() => inputRefs.current[index + 1]?.focus())
    }
  }

  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || event?.schedule_timezone || "America/New_York"
  const opening = round?.room_start_at ? formatMastersPlayerSlot(round.room_start_at, round.play_date, localTimeZone) : null
  const navigableRounds = rounds.filter((item) => mastersRoundAccessState(item, currentTime) !== "hidden" || Boolean(item.id))

  return <main className={styles.page}><div className={styles.shell}>
    <Link href={`/majors/${slug}`} className={styles.backLink}>← {event?.name || "Major"}</Link>
    {event?.is_test_event && <p className={styles.test}>TEST EVENT · TEST DATA — NOT OFFICIAL</p>}
    <header className={styles.header}><p>PLAYER SCORE ENTRY</p><h1>{round?.player_screen_name_snapshot || "My Major scorecard"}</h1><span>Enter only your own 18-hole score. The room photo is shared proof, not a group score submission.</span></header>

    {navigableRounds.length > 1 && <nav className={styles.tabs} aria-label="Available Masters score rounds">{navigableRounds.map((item) => <button key={item.play_day_id} type="button" onClick={() => setPlayDayId(item.play_day_id)} className={playDayId === item.play_day_id ? styles.selectedTab : styles.tab}>{majorRoundDayLabel(item.day_number)}</button>)}</nav>}

    {!round ? <p className={styles.notice}>No published Masters scoring round is available for your player identity.</p> : <>
      <section className={styles.context}>
        <div><span>PLAYER</span><strong>{round.player_screen_name_snapshot}</strong></div>
        <div><span>ROUND</span><strong>Round {round.day_number}</strong></div>
        <div><span>COURSE</span><strong>{course.name}</strong></div>
        <div><span>ROOM</span><strong>{round.room_label || "Not published"}</strong></div>
      </section>

      {accessState === "upcoming" && opening && <section className={styles.notStarted}><h2>YOUR ROUND {round.day_number} ROOM HAS NOT STARTED YET.</h2><p>Score entry opens at:</p><strong>{opening.date}<br />{opening.time}</strong>{opening.dayShift && <span>{opening.dayShift}</span>}</section>}
      {accessState === "closed" && !round.id && <p className={styles.notice}>ROUND {round.day_number} SCORE ENTRY IS CLOSED.</p>}
      {accessState === "hidden" && !round.id && <p className={styles.notice}>This round is not yet available for player score entry.</p>}
      {round.admin_reopened_until && accessState === "open" && <p className={styles.pending}>An admin reopened this round until {formatMastersPlayerSlot(round.admin_reopened_until, round.play_date, localTimeZone).time}. Submit before that temporary window expires.</p>}
      {round.status === "submitted" && <p className={styles.pending}>Awaiting admin verification. Submitted scores cannot be silently changed.</p>}
      {round.status === "verified" && <p className={styles.verified}>Official score verified.</p>}

      {(accessState === "open" || Boolean(round.id)) && <>
        <MajorRoomScorecardPhoto playDayId={round.play_day_id} />
        <section className={styles.scoreSection}>
          <div className={styles.scoreHeading}><div><p>YOUR SCORE</p><h2>{round.player_screen_name_snapshot}</h2><span>Round {round.day_number} — {course.name}</span></div><div><strong>{completedHoles === 18 ? strokes : "—"}</strong><span>{completedHoles} / 18 holes · {formatMajorToPar(scoreToPar)}</span></div></div>
          <div className={styles.scorecardScroll}>
            <table className={styles.scorecard}>
              <caption className={styles.srOnly}>Round {round.day_number} 18-hole player score entry</caption>
              <tbody>
                <tr><th scope="row">HOLE</th>{course.pars.map((_, index) => <th key={index} scope="col">{index + 1}</th>)}</tr>
                <tr><th scope="row">PAR</th>{course.pars.map((par, index) => <td key={index}>{par}</td>)}</tr>
                <tr><th scope="row">SCORE</th>{course.pars.map((_, index) => <td key={index}><label className={styles.srOnly} htmlFor={`masters-hole-${index + 1}`}>Hole {index + 1} score</label><input ref={(node) => { inputRefs.current[index] = node }} id={`masters-hole-${index + 1}`} inputMode="numeric" type="number" min={1} max={99} value={values[index]} disabled={!editable} onChange={(event) => updateHole(index, event.target.value)} /></td>)}</tr>
              </tbody>
            </table>
          </div>
          <div className={styles.totalBar}><span>TOTAL</span><strong>{completedHoles === 18 ? strokes : `${completedHoles} / 18`}</strong><em>{formatMajorToPar(scoreToPar)}</em></div>
          <div className={styles.actions}><button disabled={busy || !editable} onClick={() => save(false)} className={styles.secondary}>SAVE DRAFT</button><button disabled={busy || !editable || values.some((value) => !Number(value))} onClick={() => save(true)} className={styles.primary}>SUBMIT SCORECARD</button></div>
        </section>
      </>}
    </>}
    {message && <p className={styles.notice} role="status">{message}</p>}
  </div></main>
}
