import Link from "next/link"

import DiscordSignInButton from "@/components/auth/DiscordSignInButton"
import { readCurrentPlayerHandicap } from "@/lib/handicap/playerRead"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import TourThisArea from "@/components/tour/TourThisArea"

import styles from "./page.module.css"

export const dynamic = "force-dynamic"

export default async function HandicapPage() {
  const result = await readCurrentPlayerHandicap(await createServerSupabaseClient())

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/players" className={styles.backLink}>← Player Profiles</Link>
        <p className={styles.eyebrow}>Krys Leagues Handicap</p>
        <h1>Handicap Index</h1>
        <p className={styles.subtitle}>Only approved published Handicap information is shown here.</p>
        <TourThisArea tourId="handicap" />
      </header>

      {result.status === "UNAUTHENTICATED" ? (
        <section className={styles.card} aria-labelledby="handicap-sign-in-title">
          <h2 id="handicap-sign-in-title">Sign in to view your Handicap</h2>
          <p>{result.message}</p>
          <DiscordSignInButton />
        </section>
      ) : result.status !== "PUBLISHED" ? (
        <section className={styles.card} aria-labelledby="handicap-status-title">
          <span className={styles.status}>NOT YET PUBLISHED</span>
          <h2 id="handicap-status-title">Your Handicap Index is not published yet</h2>
          <p>{result.message}</p>
          <p className={styles.note}>Unreviewed ratings, draft snapshots, provisional calculations, and uncertain chronology are not displayed as official.</p>
        </section>
      ) : (
        <>
          <section className={styles.indexCard} aria-labelledby="current-index-title">
            <div>
              <p className={styles.eyebrow}>Published for</p>
              <h2 id="current-index-title">{result.screenName}</h2>
            </div>
            <strong className={styles.index}>{result.index?.toFixed(2)}</strong>
            <dl className={styles.metadata}>
              <div><dt>Model</dt><dd>{result.modelVersion}</dd></div>
              <div><dt>Approved update</dt><dd>{result.approvedAt ?? "Recorded approval"}</dd></div>
            </dl>
          </section>
          <section className={styles.card} aria-labelledby="history-title">
            <h2 id="history-title">Eligible round history</h2>
            {result.history.length === 0 ? <p>No eligible round details are available for this published view.</p> : (
              <div className={styles.tableWrap}>
                <table>
                  <thead><tr><th>Date</th><th>Course</th><th>Score</th><th>Differential</th><th>Rating version</th></tr></thead>
                  <tbody>{result.history.map((round) => <tr key={round.sourceKey}>
                    <td>{round.playedAt}</td><td>{round.courseId} · {round.difficulty}</td><td>{round.score}</td><td>{round.differential.toFixed(2)}</td><td>{round.ratingVersionId}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  )
}
