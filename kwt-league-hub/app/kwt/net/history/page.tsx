import type { Metadata } from "next"
import Link from "next/link"
import { loadVerifiedKwtNetPayload, type KwtNetPublicResult } from "@/lib/kwtNetServer"
import { formatGolfHandicapIndex } from "@/lib/handicap/indexDisplay"
import styles from "../page.module.css"

export const metadata: Metadata = {
  title: "KWT NET Past Weeks | Krys Leagues",
  description: "Verified KWT NET results by week.",
}

export const dynamic = "force-dynamic"

function badgeLabel(badge: string) {
  return badge === "KIWI_EASY" ? "Green Kiwi" : badge === "KIWI_HARD" ? "Gold Kiwi" : "Coconut"
}

function rowKey(row: KwtNetPublicResult) {
  return `${row.playerId}-${row.screenName}`
}

export default async function KwtNetHistoryPage() {
  let payload: Awaited<ReturnType<typeof loadVerifiedKwtNetPayload>> | null = null
  let error = ""
  try {
    payload = await loadVerifiedKwtNetPayload()
  } catch {
    error = "Verified KWT NET history is temporarily unavailable."
  }

  const rows = payload?.rows.filter((row) => row.combinedNet !== null) ?? []
  const waitingRows = payload?.rows.filter((row) => row.combinedNet === null) ?? []
  const event = payload?.event

  return (
    <main className={`${styles.page} ${event?.courseName.toLowerCase().includes("raptor") ? styles.raptorTheme : styles.seasonTheme}`}>
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.shell}>
        <Link href="/kwt/net" className={styles.back}>← KWT NET</Link>
        <header className={styles.header}>
          <p className={styles.eyebrow}>KRYS LEAGUES · KWT NET</p>
          <h1>NET PAST WEEKS</h1>
          <p className={styles.intro}>Verified NET results only. Standard score history remains on the regular KWT results page.</p>
          {event && <div className={styles.event}><strong>SEASON {event.season} · WEEK {event.week} · {event.courseName}</strong><span>{rows.length} verified NET players</span></div>}
        </header>

        {error && <p role="alert" className={styles.empty}>{error}</p>}
        {!error && payload?.state !== "AVAILABLE" && <p role="status" className={styles.empty}>No verified NET history is available yet. Standard results are not substituted.</p>}
        {!error && rows.length > 0 && <section className={styles.board} aria-labelledby="net-history-results">
          <div className={styles.boardHeading}><div><p className={styles.sectionKicker}>VERIFIED NET HISTORY</p><h2 id="net-history-results">NET results</h2></div><span>{rows.length} players</span></div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>WEEK</th><th>PLAYER</th><th>DIVISION</th><th>HANDICAP</th><th>EASY NET</th><th>HARD NET</th><th>TOTAL NET</th><th>POINTS</th><th>BADGES</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={rowKey(row)}>
                <td>{event?.week ?? "—"}</td>
                <td><Link href={`/players/${row.playerId}`} className={styles.player}>{row.screenName}</Link></td>
                <td>{row.division ?? "PROVISIONAL"}</td>
                <td>{Number.isFinite(row.handicapIndex) ? formatGolfHandicapIndex(row.handicapIndex) : "UNPUBLISHED"}</td>
                <td>{row.easyNet ?? "—"}</td>
                <td>{row.hardNet ?? "—"}</td>
                <td><strong>{row.combinedNet ?? "—"}</strong></td>
                <td>{row.points ?? "—"}</td>
                <td>{row.badges?.length ? row.badges.map(badgeLabel).join(" · ") : "—"}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>}
        {!error && waitingRows.length > 0 && <p className={styles.empty}>One or more official scorecards are awaiting a published handicap snapshot and are not ranked as NET results. They remain visible on the current NET board as UNPUBLISHED.</p>}
        {!error && payload?.state === "AVAILABLE" && rows.length === 0 && <p className={styles.empty}>No complete verified NET weeks are available yet.</p>}
      </div>
    </main>
  )
}
