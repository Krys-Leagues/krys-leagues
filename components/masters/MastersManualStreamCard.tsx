"use client"

import Image from "next/image"

import { formatManualGolfScore, visibleManualStreamSlots, type MastersManualStreamSlot } from "@/lib/mastersManualStreamCard"

import styles from "./MastersManualStreamCard.module.css"

export function MastersManualStreamCard({ slots }: { slots: MastersManualStreamSlot[] }) {
  const visibleSlots = visibleManualStreamSlots(slots)
  const cardWidth = visibleSlots.length === 4 ? 920 : visibleSlots.length === 3 ? 760 : 620

  return (
    <main className={styles.stage}>
      <section
        className={styles.card}
        aria-label="Krys Leagues The Mini-Golf Masters manual scorecard"
        style={{ "--card-width": `${cardWidth}px` } as React.CSSProperties}
      >
        <header className={styles.header}>
          <div className={styles.logoFrame}>
            <Image
              src="/masters/krys-leagues-logo-source.png"
              alt="Krys Leagues"
              width={62}
              height={62}
              priority
            />
          </div>
          <div className={styles.eventName}>
            <p>KRYS LEAGUES <span>·</span> THE MINI-GOLF MASTERS</p>
            <h1>CHERRY BLOSSOM</h1>
          </div>
          <div className={styles.liveMark}><i /> LIVE SCORES</div>
        </header>

        <div
          className={styles.players}
          style={{ "--player-count": visibleSlots.length } as React.CSSProperties}
        >
          {visibleSlots.map((slot) => (
            <article key={slot.slot} className={styles.player}>
              <span className={styles.blossom} aria-hidden="true">✦</span>
              <h2>{slot.name || "—"}</h2>
              <strong>{formatManualGolfScore(slot.score)}</strong>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
