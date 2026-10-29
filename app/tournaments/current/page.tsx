import Link from "next/link"
import { CURRENT_TOURNAMENTS, fetchTourneyBotPreview } from "@/lib/tourneyBot"
import LiveBracketPanel from "../LiveBracketPanel"
import styles from "./page.module.css"

export const revalidate = 60

export default async function CurrentBracketsPage() {
  const previews = await Promise.all(CURRENT_TOURNAMENTS.map(fetchTourneyBotPreview))
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link href="/tournaments" className={styles.back}>← Bracket Tournaments</Link>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Krys Leagues public brackets</p>
          <h1>Current Brackets</h1>
          <p>Live public tournament brackets currently being played.</p>
        </header>
        <section className={styles.cards} aria-label="Current live tournaments">
          {previews.map((preview) => <article className={styles.card} key={preview.id}><div className={styles.cardHeader}><h2>{preview.name}</h2><span className={preview.available ? styles.live : styles.unavailable}>{preview.status}</span></div><p>{preview.participantCount === null ? "Participant count unavailable" : `${preview.participantCount} participants`}</p><a className={styles.fullBracket} href={preview.url} target="_blank" rel="noopener noreferrer">View Full Bracket →</a></article>)}
        </section>
        <section id="live-preview" className={styles.previewSection} aria-labelledby="live-preview-title">
          <h2 id="live-preview-title">Live Bracket Preview</h2>
          <p>Public Tourney Bot data refreshes approximately every 60 seconds. This detailed bracket view stays on the selected tournament.</p>
          <LiveBracketPanel previews={previews} autoRotate={false} variant="standalone" />
        </section>
      </div>
    </main>
  )
}
