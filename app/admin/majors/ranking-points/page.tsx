import Link from "next/link"
import { MajorAdminWorkspaceLink } from "@/components/admin/majors/MajorAdminWorkspaceLink"
import { formatMajorRankingPoints, MAJOR_RANKING_POINTS } from "@/lib/majorRankingPoints"
import styles from "./page.module.css"

export default function MajorRankingPointsPage() {
  return <main className={styles.page}>
    <div className={styles.shell}>
      <nav className={styles.nav}>
        <MajorAdminWorkspaceLink className={styles.back}>← MAJORS ADMIN</MajorAdminWorkspaceLink>
        <Link className={styles.back} href="/admin/majors?view=all">ALL MAJORS</Link>
      </nav>
      <header className={styles.header}>
        <p className={styles.eyebrow}>ADMIN · FOUR MAJORS</p>
        <h1>MAJOR RANKING POINTS</h1>
        <p className={styles.intro}>The authoritative points schedule for the four-Major season. Each completed Major contributes one award to a player&apos;s season total.</p>
      </header>

      <section className={styles.explanation} aria-labelledby="ranking-points-rules">
        <h2 id="ranking-points-rules">How awards are calculated</h2>
        <ul>
          <li>Ranking points are earned at each of the four Majors, with every final place from 1 through 54 covered.</li>
          <li>Winning and high finishes receive a larger advantage, while point gaps gradually reduce farther down the field.</li>
          <li>Consistency across all four Majors matters because awards accumulate through the Major season.</li>
          <li>Tied players occupy every tied position and split the combined points equally. Decimals are retained.</li>
          <li>Completed historical Masters results are not backfilled by this reference page.</li>
        </ul>
      </section>

      <section className={styles.schedule} aria-labelledby="schedule-title">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>FINALIZED SCHEDULE</p><h2 id="schedule-title">1ST–54TH PLACE</h2></div>
          <span>{MAJOR_RANKING_POINTS.length} PLACES</span>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption className={styles.caption}>Major ranking points awarded by final overall place</caption>
            <thead><tr><th scope="col">PLACE</th><th scope="col">POINTS</th></tr></thead>
            <tbody>{MAJOR_RANKING_POINTS.map((entry) => <tr key={entry.position}><th scope="row">{entry.position}</th><td>{formatMajorRankingPoints(entry.points)}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  </main>
}
