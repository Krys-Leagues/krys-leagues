"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { formatPublicMGAScore, normalizePublicMGAStandings, type PublicMGAStanding } from "@/lib/mgaPublicLeaderboard"
import styles from "./MgaPublicLeaderboardPopup.module.css"

const MGA_STUDIO_SLUG = "mga-championship-2026"
const REFRESH_INTERVAL_MS = 15_000

export default function MgaPublicLeaderboardPopup() {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<PublicMGAStanding[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const launcherRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    let active = true
    const loadStandings = async () => {
      setLoading(true)
      const { data, error: queryError } = await supabase.rpc(
        "scoring_studio_public_leaderboard_v1",
        { p_slug: MGA_STUDIO_SLUG },
      )

      if (!active) return
      if (queryError) {
        setError("The MGA leaderboard is temporarily unavailable. Please try again.")
        setRows([])
      } else {
        setError("")
        setRows(normalizePublicMGAStandings(data))
      }
      setLoading(false)
    }

    void loadStandings()
    const interval = window.setInterval(() => void loadStandings(), REFRESH_INTERVAL_MS)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    window.addEventListener("keydown", closeOnEscape)
    closeRef.current?.focus()

    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  function close() {
    setOpen(false)
    launcherRef.current?.focus()
  }

  return (
    <>
      <div className={styles.launcherDock}>
        <button ref={launcherRef} type="button" className={styles.launcher} onClick={() => setOpen(true)}>
          MGA CHAMPIONSHIP · LIVE LEADERBOARD
        </button>
      </div>

      {open && (
        <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="mga-public-board-title">
            <button ref={closeRef} type="button" className={styles.close} aria-label="Close MGA Championship leaderboard" onClick={close}>×</button>
            <header className={styles.championshipHeader}>
              <Image className={styles.logo} src="/krys-leagues-logo.png" width={824} height={824} alt="Krys Leagues" priority />
              <div className={styles.titleBlock}>
                <p className={styles.kicker}>KRYS LEAGUES · MAJORS SERIES</p>
                <h2 id="mga-public-board-title">THE MGA CHAMPIONSHIP</h2>
                <p className={styles.series}>MAJOR CHAMPIONSHIP</p>
                <p className={styles.course}>GARDENS OF BABYLON</p>
                <p className={styles.dates}>November 12–15, 2026</p>
                <p className={styles.rounds}>4 Rounds · Thursday–Sunday</p>
              </div>
              <Image className={styles.trophy} src="/mga/scoring-studio-championship-trophy.png" width={1148} height={1371} alt="MGA Championship trophy" priority />
            </header>

            <div className={styles.boardHeading}>
              <div>
                <p className={styles.kicker}>LIVE RESULTS</p>
                <h3>Championship leaderboard</h3>
              </div>
              <p className={styles.legend}><span aria-hidden="true" />Verified scores</p>
            </div>

            {error ? <p className={styles.message} role="alert">{error}</p> : loading && rows.length === 0 ? <p className={styles.message} role="status">Loading verified standings…</p> : rows.length === 0 ? <p className={styles.message} role="status">No verified scores have been published yet.</p> : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <colgroup><col className={styles.positionCol} /><col className={styles.playerCol} /><col /><col /><col /><col /><col className={styles.combinedCol} /></colgroup>
                  <thead><tr><th scope="col">POSITION</th><th scope="col">PLAYER</th><th scope="col">R1</th><th scope="col">R2</th><th scope="col">R3</th><th scope="col">R4</th><th scope="col">COMBINED</th></tr></thead>
                  <tbody>{rows.map((row, index) => (
                    <tr key={`${row.screen_name}-${index}`}>
                      <td>{row.position ?? "—"}</td>
                      <th scope="row">{row.screen_name}</th>
                      {[row.r1, row.r2, row.r3, row.r4].map((score, roundIndex) => <td key={roundIndex} className={score === null ? styles.missing : styles.verified}>{formatPublicMGAScore(score)}</td>)}
                      <td className={row.combined === null ? styles.missing : styles.verified}>{formatPublicMGAScore(row.combined)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <p className={styles.refreshNote} aria-live="polite">Standings refresh automatically while this board is open.</p>
          </section>
        </div>
      )}
    </>
  )
}
