"use client"

import { useParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { completedThrough, formatRunningToPar, nineHoleRows, runningToPar } from "@/lib/mastersStreamScorecard"
import type { PublicMajorScoreboard } from "@/lib/majors"
import { supabase } from "@/lib/supabase"

import styles from "./page.module.css"

export default function MastersObsScorecardPage() {
  const params = useParams<{ sessionId: string; view: string }>()
  const [scoreboard, setScoreboard] = useState<PublicMajorScoreboard | null>(null)
  const [error, setError] = useState("")
  const [fireworks, setFireworks] = useState(false)
  const lastFireworks = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    const response = await supabase.rpc("get_public_major_scoreboard", { p_session_id: params.sessionId })
    if (response.error || !response.data) {
      setError(response.error?.message || "This broadcast scorecard is not published.")
      return
    }
    const next = response.data as PublicMajorScoreboard
    if (lastFireworks.current != null && next.session.fireworks_sequence > lastFireworks.current) {
      setFireworks(true)
      window.setTimeout(() => setFireworks(false), 2600)
    }
    lastFireworks.current = next.session.fireworks_sequence
    setScoreboard(next)
    setError("")
  }, [params.sessionId])

  useEffect(() => {
    // Initial public synchronization followed by the OBS polling fallback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
    const timer = window.setInterval(() => void refresh(), 850)
    return () => window.clearInterval(timer)
  }, [refresh])

  const scoreMap = useMemo(() => {
    const map = new Map<string, number>()
    scoreboard?.scores.forEach((score) => map.set(`${score.participant_id}:${score.hole_number}`, score.strokes))
    return map
  }, [scoreboard])

  if (!scoreboard) return <main className={styles.waiting}>{error || "Loading broadcast scorecard…"}</main>

  const pars = scoreboard.session.hole_pars || []
  const currentHole = scoreboard.session.current_hole
  const shownHoles = nineHoleRows(currentHole)
  const sideLabel = currentHole <= 9 ? "FRONT NINE" : "BACK NINE"

  return <main className={styles.stage}>
    {fireworks && <Fireworks />}
    <section className={styles.card} aria-label="Cherry Masters live hole-by-hole scorecard">
      <header className={styles.header}>
        <div><p>KRYS LEAGUES · CHERRY MASTERS</p><h1>{scoreboard.session.label}</h1><span>{scoreboard.session.course_name}</span></div>
        <div className={styles.current}><span>HOLE</span><strong>{currentHole}</strong><small>PAR {pars[currentHole - 1]}</small></div>
      </header>
      <div className={styles.nineHeader}><strong>{sideLabel}</strong><div>{shownHoles.map((hole) => <span key={hole} className={hole === currentHole ? styles.activeHole : ""}>{hole}</span>)}</div></div>
      <div className={styles.players}>
        {scoreboard.participants.map((participant) => <article key={participant.id} className={styles.player}>
          <div className={styles.playerIdentity}>
            <h2>{participant.player_screen_name_snapshot}</h2>
            <p>THRU {completedThrough(scoreboard.scores, participant.id) || "—"}</p>
          </div>
          <div className={styles.holeScores}>{shownHoles.map((hole) => <span key={hole} className={hole === currentHole ? styles.activeScore : ""}>{scoreMap.get(`${participant.id}:${hole}`) ?? "—"}</span>)}</div>
          <div className={styles.now}><span>NOW</span><strong>{scoreMap.get(`${participant.id}:${currentHole}`) ?? "—"}</strong></div>
          <div className={styles.total}><span>TO PAR</span><strong>{formatRunningToPar(runningToPar(scoreboard.scores, participant.id, pars))}</strong></div>
        </article>)}
      </div>
      <footer className={styles.footer}><span className={scoreboard.session.is_active ? styles.live : ""}>● {scoreboard.session.is_active ? "LIVE" : "INACTIVE"}</span><span>Broadcast scores · unofficial until Masters verification</span></footer>
    </section>
  </main>
}

function Fireworks() {
  return <div className={styles.fireworks} aria-label="Hole in one celebration">
    {Array.from({ length: 24 }, (_, index) => <i key={index} style={{ "--spark": index } as React.CSSProperties} />)}
    <strong>HOLE IN ONE!</strong>
  </div>
}
