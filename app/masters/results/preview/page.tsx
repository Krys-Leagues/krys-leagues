import Image from "next/image"
import Link from "next/link"

import {
  summarizeMastersPreview,
  totalStrokes,
  totalToPar,
} from "@/lib/mastersFinalResultsPreview"

import styles from "./page.module.css"

const ROUND_LABELS = ["ROUND 1", "ROUND 2", "ROUND 3", "FINAL ROUND"] as const
const SAFE_FOUR_MAJORS_FALLBACK = "/majors"
const PROTECTED_FOUR_MAJORS_PREVIEW_HOST = "four-majors-cccm5jrz8-krys-leagues-projects.vercel.app"

function getFourMajorsHubHref() {
  const configured = process.env.NEXT_PUBLIC_FOUR_MAJORS_HUB_URL?.trim()
  if (!configured) return SAFE_FOUR_MAJORS_FALLBACK

  try {
    const destination = new URL(configured)
    if (destination.hostname === PROTECTED_FOUR_MAJORS_PREVIEW_HOST) return SAFE_FOUR_MAJORS_FALLBACK
  } catch {
    return SAFE_FOUR_MAJORS_FALLBACK
  }

  return configured
}

export default function MastersResultsPreviewPage() {
  const summary = summarizeMastersPreview()
  const players = summary.vipQualifiers
  const fourMajorsHubHref = getFourMajorsHubHref()

  return (
    <main className={styles.page}>
      <div className={styles.blossomGlow} aria-hidden="true" />
      <div className={styles.shell}>
        <nav className={styles.nav} aria-label="Masters preview navigation">
          <Link href={fourMajorsHubHref} className={styles.backLink}>
            ← Four Majors Hub
          </Link>
          <span className={styles.routeMark}>MASTERS-OWNED PREVIEW</span>
        </nav>

        <header className={styles.masthead}>
          <div className={styles.mastheadArt} aria-hidden="true">
            <Image
              src="/major-scorecards/masters/masters-large-scorecard.webp"
              alt=""
              fill
              priority
              sizes="(max-width: 900px) 100vw, 1180px"
            />
          </div>
          <div className={styles.mastheadShade} aria-hidden="true" />
          <div className={styles.mastheadContent}>
            <p className={styles.eyebrow}>KRYS LEAGUES · CHAMPIONSHIP ARCHIVE</p>
            <h1>THE MINI-GOLF MASTERS</h1>
            <p className={styles.subtitle}>Cherry Blossom · 2026 historical championship snapshot</p>
            <div className={styles.mastheadBadges}>
              <span className={styles.snapshotBadge}>APPROVED 2026 SNAPSHOT</span>
              <span className={styles.goldBadge}>TOP 10 SOURCE LOCKED</span>
            </div>
          </div>
          <div className={styles.trophyMark} aria-hidden="true">
            <span>✦</span>
            <strong>THE<br />MASTERS</strong>
          </div>
        </header>

        <section className={styles.notice} aria-live="polite">
          <strong>PREVIEW ONLY · FINALIZATION BLOCKED</strong>
          <span>
            This presentation uses the approved 2026 historical Top 10 snapshot. It does not claim that all database placement rows are finalized, and it does not modify verified scorecards.
          </span>
        </section>

        <section className={styles.statRail} aria-label="Snapshot facts">
          <article>
            <strong>{players.length}</strong>
            <span>approved leaderboard rows</span>
          </article>
          <article>
            <strong>4</strong>
            <span>rounds preserved</span>
          </article>
          <article>
            <strong>T-9</strong>
            <span>tie preserved exactly</span>
          </article>
          <article>
            <strong>—</strong>
            <span>remaining placements inferred</span>
          </article>
        </section>

        <section className={styles.scoreboard} aria-labelledby="scoreboard-title">
          <header className={styles.boardHeader}>
            <div>
              <p className={styles.boardKicker}>CHERRY BLOSSOM · APPROVED SOURCE</p>
              <h2 id="scoreboard-title">2026 MASTERS CHAMPIONSHIP</h2>
            </div>
            <div className={styles.boardStatus}>
              <span className={styles.statusDot} aria-hidden="true" />
              HISTORICAL PREVIEW
            </div>
          </header>

          <div className={styles.courseRibbon}>
            <span>18 HOLES</span>
            <i aria-hidden="true" />
            <span>36 HOLES</span>
            <i aria-hidden="true" />
            <span>54 HOLES</span>
            <i aria-hidden="true" />
            <span>72 HOLES</span>
            <strong>GOLD CHAMPIONSHIP BOARD</strong>
          </div>

          <div className={styles.tableScroll}>
            <table className={styles.leaderboardTable}>
              <thead>
                <tr>
                  <th scope="col">PLACE</th>
                  <th scope="col">PLAYER</th>
                  {ROUND_LABELS.map((label, index) => (
                    <th scope="col" key={label}>
                      <span>{label}</span>
                      <small>{index < 3 ? "VERIFIED ROUND" : "VERIFIED FINAL"}</small>
                    </th>
                  ))}
                  <th scope="col">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {players.map((player) => {
                  const place = player.isTied ? `T-${player.officialPlacement}` : String(player.officialPlacement)
                  const champion = player.officialPlacement === 1

                  return (
                    <tr key={player.playerId} className={champion ? styles.championRow : undefined}>
                      <td className={styles.placeCell}>
                        <span className={champion ? styles.championPlace : undefined}>{place}</span>
                        {champion ? <small>CHAMPION</small> : null}
                      </td>
                      <th scope="row" className={styles.playerCell}>
                        <span className={styles.playerName}>{player.screenName}</span>
                        {champion ? <span className={styles.winnerSeal}>2026 WINNER PRESENTATION</span> : null}
                      </th>
                      {player.rounds.map((round, index) => (
                        <td key={`${player.playerId}-${index}`} className={styles.roundCell}>
                          <strong>{round?.strokes ?? "—"}</strong>
                          <small>{round ? formatToPar(round.toPar) : "NOT RECORDED"}</small>
                        </td>
                      ))}
                      <td className={styles.totalCell}>
                        <strong>{totalStrokes(player)}</strong>
                        <small>{formatToPar(totalToPar(player))}</small>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <footer className={styles.boardFooter}>
            <span>APPROVED 2026 HISTORICAL TOP 10 · EXACT SCREEN NAMES, SCORES, PLACEMENTS, AND TIE PRESERVED</span>
            <span>NO DATABASE FINALIZATION PERFORMED</span>
          </footer>
        </section>

        <section className={styles.sourcePanel}>
          <div>
            <p className={styles.boardKicker}>SOURCE BOUNDARY</p>
            <h2>What this preview does — and does not — establish</h2>
          </div>
          <p>
            The approved source supplies the Top 10 shown above. The remaining 44 placement rows are intentionally withheld rather than inferred from partial or incomplete totals. Connecting the Masters trophy to Four Majors still requires separate Owner approval and authoritative placement finalization.
          </p>
        </section>
      </div>
    </main>
  )
}

function formatToPar(value: number) {
  return value === 0 ? "E" : value > 0 ? `+${value}` : String(value)
}
