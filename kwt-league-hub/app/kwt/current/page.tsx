import type { Metadata } from "next"
import Link from "next/link"
import { KwtAreaNav } from "@/components/KwtAreaNav"
import { loadPublicKwtCurrentSeason, type KwtCurrentResult } from "@/lib/kwtCurrentServer"
import styles from "../page.module.css"

export const metadata: Metadata = {
  title: "KWT Current Season | Krys Leagues",
  description: "Official KWT current-season Standard results and division leaderboards.",
}

export const dynamic = "force-dynamic"

async function readCurrentSeason() {
  try {
    return { value: await loadPublicKwtCurrentSeason(), error: null }
  } catch (error) {
    console.error("[public-kwt-current] read failed", error)
    return { value: null, error }
  }
}

const currentTournamentNav = <KwtAreaNav title="Current Tournament" items={[
  { label: "Current Season", description: "Official Season 15 Standard standings.", href: "/kwt/current" },
  { label: "Weekly Results", description: "Verified scorecards by season and week.", href: "/kwt/history" },
  { label: "Divisions", description: "Amateur, Semi-Pro, Pro, and Elite results.", href: "/kwt/current#divisions" },
  { label: "Standard Leaderboards", description: "Current-season Standard rankings.", href: "/kwt/current#standard-leaderboards" },
  { label: "KWT NET", description: "Separate NET standings, allowances, and achievements.", href: "/kwt/net" },
]} />

function score(value: number | null) {
  return value === null ? "—" : value > 0 ? `+${value}` : value.toString()
}

function DivisionTable({ rows }: { rows: KwtCurrentResult[] }) {
  return <div className={styles.tableWrap}>
    <table className={styles.table}>
      <thead><tr><th>Division place</th><th>Player</th><th className={styles.numeric}>Easy</th><th className={styles.numeric}>Hard</th><th className={styles.numeric}>Total</th><th className={styles.numeric}>Points</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>
        <td className={styles.numeric}>{row.division_placement ?? "—"}</td>
        <td>{row.player_name}</td>
        <td className={`${styles.numeric} ${styles.score}`}>{score(row.easy_score)}</td>
        <td className={`${styles.numeric} ${styles.score}`}>{score(row.hard_score)}</td>
        <td className={`${styles.numeric} ${styles.score}`}>{score(row.total_score)}</td>
        <td className={styles.numeric}>{row.points ?? "—"}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

export default async function KwtCurrentPage() {
  const loaded = await readCurrentSeason()
  if (loaded.error || !loaded.value) {
    return <main className={styles.page}><div className={styles.shell}><Link href="/kwt" className={styles.back}>← KWT Hub</Link><section className={styles.section}><h1>KWT Current Season</h1><p className={styles.notice}>Current Standard results are temporarily unavailable while the verified public reader is being connected.</p></section>{currentTournamentNav}</div></main>
  }

  const { season, results, currentWeek } = loaded.value
  const divisions = Array.from(new Set(results.map((row) => row.division))).sort()
  return <main className={styles.page}>
      <div className={styles.shell}>
        <Link href="/kwt" className={styles.back}>← KWT Hub</Link>
        <header className={styles.header}>
          <p className={styles.eyebrow}>OFFICIAL CURRENT SEASON · STANDARD</p>
          <h1>KWT Season {season.season_number}</h1>
          <p>Week {currentWeek ?? "—"} official Standard results from the canonical operational source. Valid negative golf scores are preserved exactly.</p>
        </header>
        {currentTournamentNav}
        <section className={styles.section} id="standard-leaderboards" aria-labelledby="standard-title">
          <h2 id="standard-title">Standard Leaderboards</h2>
          <p className={styles.sectionIntro}>{results.length} official results across {divisions.length} verified divisions. Standard results remain separate from NET.</p>
        </section>
        <section className={styles.section} id="divisions" aria-labelledby="divisions-title">
          <h2 id="divisions-title">Divisions</h2>
          <div className={styles.divisionGrid}>{divisions.map((division) => {
            const divisionRows = results.filter((row) => row.division === division)
            return <article key={division} className={styles.divisionCard}><h3>{division}</h3><p>{divisionRows.length} official scorecards</p><DivisionTable rows={divisionRows} /></article>
          })}</div>
        </section>
        <section className={styles.section} aria-labelledby="season-links-title">
          <h2 id="season-links-title">More KWT</h2>
          <div className={styles.pager}><Link href="/kwt/history" className={styles.back}>Weekly Results &amp; Previous Seasons</Link><Link href="/kwt/records" className={styles.back}>KWT Records</Link></div>
        </section>
      </div>
    </main>
}
