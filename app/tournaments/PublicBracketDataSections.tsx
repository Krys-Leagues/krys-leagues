import Link from "next/link"
import type { PublicTournamentOverview } from "@/lib/tournaments/public"
import LiveBracketPreview from "./current/LiveBracketPreview"
import styles from "./public-data.module.css"

export default function PublicBracketDataSections({ overview }: { overview: PublicTournamentOverview }) {
  if (!overview.available || (overview.live.length === 0 && overview.completed.length === 0)) return null
  return <div className={styles.sections}>
    {overview.live.length > 0 && <section className={styles.section} id="live-bracket-data" aria-labelledby="live-bracket-data-title">
      <div className={styles.header}><div><p className={styles.eyebrow}>Website-managed tournaments</p><h2 id="live-bracket-data-title">Live Bracket Preview</h2></div><span className={styles.live}>LIVE</span></div>
      <p className={styles.muted}>Published brackets only. Match-center scheduling and scorecard details remain protected for participants and tournament admins.</p>
      <LiveBracketPreview tournaments={overview.live} />
    </section>}
    {overview.completed.length > 0 && <section className={styles.section} aria-labelledby="completed-bracket-data-title">
      <div className={styles.header}><div><p className={styles.eyebrow}>Verified website history</p><h2 id="completed-bracket-data-title">Completed Tournaments</h2></div></div>
      <div className={styles.cards}>{overview.completed.map((tournament) => <article key={tournament.id} className={styles.card}><h3>{tournament.name}</h3><p className={styles.muted}>{tournament.bracket_size}-player single-elimination bracket</p>{tournament.champion ? <p><strong>Champion:</strong> {tournament.champion}</p> : <p className={styles.muted}>Final champion is not yet verified.</p>}{tournament.runner_up && <p><strong>Runner-up:</strong> {tournament.runner_up}</p>}{tournament.trophy_awarded && <p className={styles.trophy}>Approved trophy award recorded</p>}<Link href={`/tournaments/${tournament.slug}`} className={styles.link}>View completed bracket →</Link></article>)}</div>
      <Link href="/tournaments/history" className={styles.link}>Open full tournament history →</Link>
    </section>}
  </div>
}
