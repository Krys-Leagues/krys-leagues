"use client"

import Image from "next/image"
import { useMemo } from "react"

import { completedThrough, formatRunningToPar, nineHoleRows, runningToPar } from "@/lib/mastersStreamScorecard"
import type { PublicMajorScoreboard } from "@/lib/majors"

import styles from "./MastersStreamScorecardView.module.css"

export function MastersStreamScorecardView({
  scoreboard,
}: {
  scoreboard: PublicMajorScoreboard
}) {
  const scoreMap = useMemo(() => {
    const map = new Map<string, number>()
    scoreboard.scores.forEach((score) => map.set(`${score.participant_id}:${score.hole_number}`, score.strokes))
    return map
  }, [scoreboard.scores])

  const pars = scoreboard.session.hole_pars || []
  const currentHole = scoreboard.session.current_hole
  const shownHoles = nineHoleRows(currentHole)
  const sideLabel = currentHole <= 9 ? "FRONT NINE" : "BACK NINE"
  const roundNumber = scoreboard.session.label.match(/round\s+(\d+)/i)?.[1] || "—"
  const difficulty = scoreboard.session.course_code === "CBH" ? "HARD" : "EASY"
  const roomName = scoreboard.session.label.split("·")[0]?.trim() || scoreboard.session.label

  return (
    <main className={styles.stage}>
      <section className={styles.card} aria-label="Cherry Masters live hole-by-hole scorecard">
        <header className={styles.header}>
          <div className={styles.brand}>
            <Image
              src="/masters/krys-leagues-logo-source.png"
              alt="Krys Leagues"
              width={66}
              height={66}
              priority
            />
            <div>
              <p>KRYS LEAGUES</p>
              <h1>MASTERS</h1>
              <span>CHERRY BLOSSOM</span>
            </div>
          </div>
          <div className={styles.context}>
            <strong>{roomName}</strong>
            <span>ROUND {roundNumber} · {difficulty}</span>
          </div>
          <div className={styles.current}>
            <span>HOLE</span>
            <strong>{currentHole}</strong>
            <small>PAR {pars[currentHole - 1]}</small>
          </div>
        </header>

        <div className={styles.nineHeader}>
          <strong>{sideLabel}</strong>
          <div>{shownHoles.map((hole) => <span key={hole} className={hole === currentHole ? styles.activeHole : ""}>{hole}</span>)}</div>
        </div>

        <div className={styles.players}>
          {scoreboard.participants.map((participant) => (
            <article key={participant.id} className={styles.player}>
              <div className={styles.playerIdentity}>
                <h2>{participant.player_screen_name_snapshot}</h2>
                <p>THRU {completedThrough(scoreboard.scores, participant.id) || "—"}</p>
              </div>
              <div className={styles.holeScores}>
                {shownHoles.map((hole) => <span key={hole} className={hole === currentHole ? styles.activeScore : ""}>{scoreMap.get(`${participant.id}:${hole}`) ?? "—"}</span>)}
              </div>
              <div className={styles.now}><span>NOW</span><strong>{scoreMap.get(`${participant.id}:${currentHole}`) ?? "—"}</strong></div>
              <div className={styles.total}><span>TO PAR</span><strong>{formatRunningToPar(runningToPar(scoreboard.scores, participant.id, pars))}</strong></div>
            </article>
          ))}
        </div>

        <footer className={styles.footer}>
          <span className={scoreboard.session.is_active ? styles.live : ""}>● {scoreboard.session.is_active ? "LIVE" : "INACTIVE"}</span>
          <span>UNOFFICIAL LIVE STREAM SCORECARD</span>
        </footer>
      </section>
    </main>
  )
}
