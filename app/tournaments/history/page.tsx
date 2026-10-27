import Link from "next/link"
import { loadPublicTournamentOverview } from "@/lib/tournaments/public"
import styles from "../current/page.module.css"

export const dynamic = "force-dynamic"

export default async function TournamentHistoryPage() {
  const overview = await loadPublicTournamentOverview()
  return <main className={styles.page}><div className={styles.shell}><Link href="/tournaments" className={styles.back}>← Bracket Tournaments</Link><header className={styles.header}><p className={styles.eyebrow}>Krys Leagues results archive</p><h1>Past Tournament Winners</h1><p>Public results from completed website-managed tournaments. Trophy honors remain in the shared Hall of Champions.</p></header>{overview.completed.length === 0 ? <p className={styles.empty}>No completed website-managed tournaments are published yet.</p> : overview.completed.map((tournament) => <article className={styles.previewCard} key={tournament.id}><div className={styles.previewHeader}><div><p className={styles.eyebrow}>Completed tournament</p><h2>{tournament.name}</h2></div><span className={styles.live}>COMPLETED</span></div><p className={styles.meta}>{tournament.bracket_size}-player single-elimination bracket</p>{tournament.champion ? <p><strong>Champion:</strong> {tournament.champion}</p> : <p className={styles.empty}>Champion not yet verified.</p>}{tournament.runner_up && <p><strong>Runner-up:</strong> {tournament.runner_up}</p>}{tournament.trophy_awarded && <p><strong>Approved trophy:</strong> recorded</p>}<Link className={styles.fullBracket} href={`/tournaments/${tournament.slug}`}>View completed bracket →</Link></article>)}<p><Link href="/champions?category=bracket&amp;from=tournaments" className={styles.fullBracket}>Open Bracket Hall of Champions →</Link></p></div></main>
}
