"use client"

import { useState } from "react"
import type { TourneyBotPreview } from "@/lib/tourneyBot"
import styles from "./page.module.css"

export default function LiveBracketPreview({ previews }: { previews: TourneyBotPreview[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const preview = previews[selectedIndex] || previews[0]
  if (!preview) return <p className={styles.empty}>Live bracket preview is temporarily unavailable.</p>

  return (
    <div>
      <div className={styles.tabs} role="tablist" aria-label="Live brackets">
        {previews.map((item, index) => <button key={item.id} type="button" role="tab" aria-selected={selectedIndex === index} className={selectedIndex === index ? styles.activeTab : styles.tab} onClick={() => setSelectedIndex(index)}>{item.name}</button>)}
      </div>
      <article className={styles.previewCard} role="tabpanel">
        <div className={styles.previewHeader}><div><p className={styles.eyebrow}>Live bracket preview</p><h3>{preview.name}</h3></div><span className={preview.available ? styles.live : styles.unavailable}>{preview.status}</span></div>
        {!preview.available ? <p className={styles.empty}>{preview.error || "Live bracket preview is temporarily unavailable."}</p> : <>
          <p className={styles.meta}>{preview.participantCount === null ? "Participant count unavailable" : `${preview.participantCount} participant${preview.participantCount === 1 ? "" : "s"}`}{preview.champion ? ` · Champion: ${preview.champion}` : ""}</p>
          {preview.rounds.length > 0 && <div className={styles.rounds}>{preview.rounds.map((round) => <section key={round.name} className={styles.round}><h4>{round.name}</h4>{round.matches.length ? round.matches.map((match, index) => <div className={styles.match} key={`${round.name}-${index}`}><span>{match.playerOne || "Pending"} {match.scoreOne ? `(${match.scoreOne})` : ""}</span><span>vs</span><span>{match.playerTwo || "Pending"} {match.scoreTwo ? `(${match.scoreTwo})` : ""}</span><small>{match.status || "Pending"}</small></div>) : <p className={styles.meta}>No matchups reported yet.</p>}</section>)}</div>}
          {preview.standings.length > 0 && <section className={styles.standings}><h4>Results</h4>{preview.standings.map((entry, index) => <p key={`${entry.name}-${index}`}><strong>{entry.place || `${index + 1}.`}</strong> {entry.name}{entry.score ? ` · ${entry.score}` : ""}</p>)}</section>}
          {preview.participants.length > 0 && <p className={styles.meta}>Public participants: {preview.participants.join(", ")}</p>}
        </>}
        <a className={styles.fullBracket} href={preview.url} target="_blank" rel="noopener noreferrer">View Full Bracket →</a>
      </article>
    </div>
  )
}
