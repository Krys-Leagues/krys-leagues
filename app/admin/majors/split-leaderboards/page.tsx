"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { MajorAdminWorkspaceLink } from "@/components/admin/majors/MajorAdminWorkspaceLink"
import { formatMastersSplitScore, type MastersSplitLeaderboards, type MastersSplitRow, type MastersSplitRoundNumber } from "@/lib/mastersSplitLeaderboards"
import styles from "./page.module.css"

type Payload = MastersSplitLeaderboards & { event: { id: string; name: string; year: number | null }; generatedAt: string }

export default function MastersSplitLeaderboardsPage() {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const result = await fetch("/api/admin/majors/split-leaderboards", { cache: "no-store" })
      const body = await result.json() as Payload | { error?: string }
      if (!result.ok) throw new Error("error" in body ? body.error || "Unable to load Masters split results." : "Unable to load Masters split results.")
      setPayload(body as Payload)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Masters split results.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  return <main className={styles.page}>
    <div className={styles.shell}>
      <nav className={styles.nav}><MajorAdminWorkspaceLink className={styles.back}>← MASTERS ADMIN</MajorAdminWorkspaceLink><Link className={styles.refresh} href="/admin/majors/split-leaderboards">MASTERS 60/40 RESULTS</Link></nav>
      <header className={styles.header}><div><p className={styles.eyebrow}>ADMIN · HISTORICAL RESULTS VIEW</p><h1>MASTERS 60/40 SPLIT LEADERBOARDS</h1><p className={styles.subhead}>Round 2 classification is locked. Final ranking is calculated independently inside each historical group.</p></div><button type="button" className={styles.refreshButton} onClick={() => void load()} disabled={loading}>{loading ? "LOADING…" : "REFRESH RESULTS"}</button></header>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading && !payload && !error && <p className={styles.loading}>Loading authoritative Masters scorecards…</p>}
      {payload && <>
        <section className={styles.snapshot} aria-labelledby="cut-snapshot-title">
          <div><p className={styles.eyebrow}>2026 MASTERS CUT SNAPSHOT</p><h2 id="cut-snapshot-title">Round 2 split reference</h2></div>
          <div className={styles.snapshotGrid}><div><span>Completed Round 2 field</span><strong>{payload.eligiblePlayers.length}</strong></div><div><span>TOP 60%</span><strong>{payload.top60.length} players</strong><small>{formatMastersSplitScore(payload.cutLine)} or better</small></div><div><span>BOTTOM 40%</span><strong>{payload.bottom40.length} players</strong><small>{formatMastersSplitScore(payload.cutLine + 1)} or worse</small></div></div>
        </section>
        <Leaderboard title="MASTERS — TOP 60% RESULTS" rows={payload.top60} />
        <Leaderboard title="MASTERS — BOTTOM 40% RESULTS" rows={payload.bottom40} />
        <Unclassified rows={payload.unclassified} />
      </>}
    </div>
  </main>
}

function Leaderboard({ title, rows }: { title: string; rows: MastersSplitRow[] }) {
  return <section className={styles.board} aria-labelledby={title}>
    <header className={styles.boardHeader}><div><p className={styles.eyebrow}>ROUND 2 CLASSIFICATION LOCKED</p><h2 id={title}>{title}</h2></div><span>{rows.length} PLAYERS</span></header>
    <div className={styles.tableScroll}><table><thead><tr><th>RANK</th><th>PLAYER</th>{([1, 2, 3, 4] as MastersSplitRoundNumber[]).map((round) => <th key={round}>ROUND {round}</th>)}<th>OVERALL</th><th>RANKING POINTS</th></tr></thead><tbody>{rows.map((row) => <tr key={row.entryId}><td className={styles.rank}>{row.rank || "—"}</td><th scope="row"><span className={styles.playerName}>{row.name}</span><small className={styles.resultStatus}>{row.resultStatus} · {row.completedRoundCount}/4 ROUNDS</small></th>{([1, 2, 3, 4] as MastersSplitRoundNumber[]).map((round) => <ScoreCell key={round} row={row} round={round} />)}<td className={styles.overall}>{formatMastersSplitScore(row.overall)}</td><td className={styles.points}>—</td></tr>)}</tbody></table></div>
    {rows.length === 0 && <p className={styles.empty}>No classified players found.</p>}
  </section>
}

function Unclassified({ rows }: { rows: MastersSplitRow[] }) {
  return <section className={styles.unclassified} aria-labelledby="unclassified-title"><div><p className={styles.eyebrow}>ADMIN-ONLY EXCEPTION LIST</p><h2 id="unclassified-title">NOT CLASSIFIED IN ROUND-2 SPLIT</h2><p>These event players do not have both completed Easy rounds and are not counted in either group.</p></div>{rows.length > 0 && <div className={styles.tableScroll}><table><thead><tr><th>PLAYER</th>{([1, 2, 3, 4] as MastersSplitRoundNumber[]).map((round) => <th key={round}>ROUND {round}</th>)}<th>OVERALL</th><th>RANKING POINTS</th></tr></thead><tbody>{rows.map((row) => <tr key={row.entryId}><th scope="row"><span className={styles.playerName}>{row.name}</span><small className={styles.resultStatus}>{row.resultStatus} · {row.completedRoundCount}/4 ROUNDS</small></th>{([1, 2, 3, 4] as MastersSplitRoundNumber[]).map((round) => <ScoreCell key={round} row={row} round={round} />)}<td className={styles.overall}>{formatMastersSplitScore(row.overall)}</td><td className={styles.points}>—</td></tr>)}</tbody></table></div>}{rows.length === 0 && <p className={styles.empty}>All event players with recorded entries completed both Round 1 and Round 2.</p>}</section>
}

function ScoreCell({ row, round }: { row: MastersSplitRow; round: MastersSplitRoundNumber }) {
  const score = row.rounds[round]
  return <td className={styles.scoreCell}><strong>{formatMastersSplitScore(score.score)}</strong><small>{score.status ? score.status.toUpperCase() : "NOT PLAYED"}</small></td>
}
