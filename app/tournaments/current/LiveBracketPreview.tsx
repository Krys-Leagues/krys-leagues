"use client"

import { useState } from "react"
import type { PublicLiveTournament } from "@/lib/tournaments/public"
import styles from "./page.module.css"

export default function LiveBracketPreview({ tournaments }: { tournaments: PublicLiveTournament[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const tournament = tournaments[selectedIndex] || tournaments[0]
  if (!tournament) return null

  return (
    <div>
      <div className={styles.tabs} role="tablist" aria-label="Live brackets">
        {tournaments.map((item, index) => <button key={item.id} type="button" role="tab" aria-selected={selectedIndex === index} className={selectedIndex === index ? styles.activeTab : styles.tab} onClick={() => setSelectedIndex(index)}>{item.name}</button>)}
      </div>
      <article className={styles.previewCard} role="tabpanel">
        <div className={styles.previewHeader}><div><p className={styles.eyebrow}>Published website bracket</p><h3>{tournament.name}</h3></div><span className={styles.live}>LIVE</span></div>
        <p className={styles.meta}>{tournament.bracket_size}-player single elimination · {tournament.participant_count} named participants in the published bracket</p>
        <div className={styles.rounds}>{tournament.rounds.map((round) => <section key={round.round_number} className={styles.round}><h4>{round.name}</h4>{tournament.matches.filter((match) => match.round_number === round.round_number).map((match) => <div className={styles.match} key={`${match.round_number}-${match.match_number}`}><span>{match.player_a_name || "Waiting"}</span><span>vs</span><span>{match.player_b_name || "Waiting"}</span><small>{match.status === "completed" ? `Winner: ${match.winner_name || "Verified"}` : match.status}</small></div>)}</section>)}</div>
        <a className={styles.fullBracket} href={`/tournaments/${tournament.slug}`}>Open full bracket and Match Center →</a>
      </article>
    </div>
  )
}
