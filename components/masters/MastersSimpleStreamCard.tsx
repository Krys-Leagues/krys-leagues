"use client"

import Image from "next/image"

import { formatRunningToPar } from "@/lib/mastersStreamScorecard"
import type { PublicMajorScoreboard } from "@/lib/majors"

import styles from "./MastersSimpleStreamCard.module.css"

export function MastersSimpleStreamCard({ scoreboard }: { scoreboard: PublicMajorScoreboard }) {
  const totals = scoreboard.session.stream_total_scores || {}

  return (
    <main className={styles.stage}>
      <section className={styles.card} aria-label="The Mini-Golf Masters simple live score card">
        <header>
          <Image src="/masters/krys-leagues-logo-source.png" alt="Krys Leagues" width={58} height={58} priority />
          <div>
            <p>KRYS LEAGUES</p>
            <h1>THE MINI-GOLF MASTERS</h1>
          </div>
          <span>CHERRY BLOSSOM</span>
        </header>
        <div className={styles.players} style={{ "--player-count": scoreboard.participants.length } as React.CSSProperties}>
          {scoreboard.participants.map((participant) => (
            <article key={participant.id}>
              <h2>{participant.player_screen_name_snapshot}</h2>
              <strong>{formatRunningToPar(totals[participant.id] ?? 0)}</strong>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
