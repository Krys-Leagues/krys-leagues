import type { Metadata } from "next"
import Link from "next/link"
import { filterPublicKwtHistoryRows, formatKwtPlacement, type PublicKwtHistoryRow } from "@/lib/kwtHistory"
import { loadPublicKwtHistory } from "@/lib/kwtHistoryServer"
import styles from "./page.module.css"

export const metadata: Metadata = {
  title: "KWT Score History | Krys Leagues",
  description: "Official historical Krys Weekend Tournament scores by season and week.",
}

export const dynamic = "force-dynamic"

type HistorySearchParams = Promise<{
  season?: string | string[]
  week?: string | string[]
  search?: string | string[]
}>

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function positiveInteger(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export default async function KwtHistoryPage({ searchParams }: { searchParams: HistorySearchParams }) {
  const params = await searchParams
  const selectedSeason = positiveInteger(first(params.season))
  const selectedWeek = positiveInteger(first(params.week))
  const search = (first(params.search) || "").trim().slice(0, 80)
  let rows: PublicKwtHistoryRow[] = []
  let error = ""

  try {
    rows = await loadPublicKwtHistory()
  } catch (caught) {
    console.error("[public-kwt-history] read failed", caught)
    error = "KWT score history is temporarily unavailable."
  }

  const seasons = Array.from(new Set(rows.map((row) => row.seasonNumber))).sort((left, right) => right - left)
  const weeks = Array.from(new Set(rows
    .filter((row) => !selectedSeason || row.seasonNumber === selectedSeason)
    .map((row) => row.weekNumber))).sort((left, right) => left - right)
  const filteredRows = filterPublicKwtHistoryRows(rows, {
    season: selectedSeason,
    week: selectedWeek,
    search,
  })

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link href="/kwt" className={styles.back}>← KWT</Link>

        <header className={styles.header}>
          <p className={styles.eyebrow}>KRYS LEAGUES · KRYS WEEKEND TOURNAMENT</p>
          <h1>KWT Score History</h1>
          <p>Official imported tournament results, preserved by season and week.</p>
        </header>

        <form className={styles.filters} method="get" aria-label="Filter KWT score history">
          <label>
            <span>Season</span>
            <select name="season" defaultValue={selectedSeason?.toString() || ""}>
              <option value="">All seasons</option>
              {seasons.map((season) => <option key={season} value={season}>Season {season}</option>)}
            </select>
          </label>
          <label>
            <span>Week</span>
            <select name="week" defaultValue={selectedWeek?.toString() || ""}>
              <option value="">All weeks</option>
              {weeks.map((week) => <option key={week} value={week}>Week {week}</option>)}
            </select>
          </label>
          <label className={styles.search}>
            <span>Player or course</span>
            <input name="search" defaultValue={search} maxLength={80} placeholder="Search history" />
          </label>
          <button type="submit">Apply filters</button>
          <Link href="/kwt/history" className={styles.clear}>Clear</Link>
        </form>

        <section className={styles.history} aria-labelledby="history-results">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.kicker}>VERIFIED HISTORY</p>
              <h2 id="history-results">Tournament scorecards</h2>
            </div>
            {!error && <span>{filteredRows.length} {filteredRows.length === 1 ? "result" : "results"}</span>}
          </div>

          {error && <p className={styles.empty} role="alert">{error}</p>}
          {!error && filteredRows.length === 0 && (
            <p className={styles.empty}>No KWT history matches those filters.</p>
          )}
          {!error && filteredRows.length > 0 && (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Season</th>
                    <th>Week</th>
                    <th>Player</th>
                    <th>Easy course</th>
                    <th className={styles.numeric}>Easy score</th>
                    <th>Hard course</th>
                    <th className={styles.numeric}>Hard score</th>
                    <th className={styles.numeric}>Combined</th>
                    <th className={styles.numeric}>Placement</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, index) => (
                    <tr key={`${row.seasonNumber}-${row.weekNumber}-${row.playerName}-${row.easyCourse}-${row.hardCourse}-${index}`}>
                      <td data-label="Season">{row.seasonNumber}</td>
                      <td data-label="Week">{row.weekNumber}</td>
                      <th scope="row" data-label="Player">{row.playerName}</th>
                      <td data-label="Easy course">{row.easyCourse}</td>
                      <td data-label="Easy score" className={styles.score}>{row.easyScore}</td>
                      <td data-label="Hard course">{row.hardCourse}</td>
                      <td data-label="Hard score" className={styles.score}>{row.hardScore}</td>
                      <td data-label="Combined" className={styles.total}>{row.totalScore}</td>
                      <td data-label="Placement" className={styles.placement}>{formatKwtPlacement(row.placement)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
