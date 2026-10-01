"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { buildMastersLiveRows, formatMastersLiveScore, sortMastersLiveRows, type MastersLiveRow, type MastersRoundNumber } from "@/lib/mastersLiveResults"
import { majorRoundDayLabel, type MajorPlayerScorecard, type MajorResultsPayload } from "@/lib/majors"
import { supabase } from "@/lib/supabase"
import styles from "./page.module.css"

export default function MajorResultsPage() {
  const { slug } = useParams<{ slug: string }>()
  const [data, setData] = useState<MajorResultsPayload | null>(null), [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null), [message, setMessage] = useState("")
  const load = useCallback(async () => {
    const eventResult = await supabase.from("major_events").select("id").eq("slug", slug).maybeSingle()
    if (!eventResult.data) { setMessage(eventResult.error?.message || "Major not found."); return }
    const result = await supabase.rpc("get_public_major_live_results", { p_major_event_id: eventResult.data.id })
    setData(result.data as MajorResultsPayload | null); setMessage(result.error?.message || "")
  }, [slug])
  // Initial public synchronization plus lightweight live polling.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 15_000); return () => window.clearInterval(timer) }, [load])
  const rows = useMemo(() => data ? sortMastersLiveRows(buildMastersLiveRows(data), "overall") : [], [data])
  const selectedRow = rows.find((row) => row.playerId === selectedPlayerId) || null
  const selectedCards = useMemo(() => data?.rounds.flatMap((round) => round.cards).filter((card) => card.player_id === selectedPlayerId) || [], [data, selectedPlayerId])
  if (!data) return <main className={styles.loading}>{message || "Loading live Masters results…"}</main>
  return <main className={styles.page}><div className={styles.shell}><nav className={styles.trackerNav} aria-label="Live Masters Score Tracker navigation"><Link className={styles.backLink} href={`/majors/${slug}`}>← Back to {data.event.name}</Link><Link className={styles.closeTracker} href="/" replace aria-label="Close Live Masters Score Tracker and return to the Krys Leagues Hub"><span aria-hidden="true">×</span> CLOSE LIVE SCORE TRACKER</Link></nav>{data.event.is_test_event && <p className={styles.testBanner}>TEST EVENT · TEST DATA — NOT OFFICIAL</p>}
    <section className={styles.ornateBoard} aria-labelledby="masters-live-title">
      <div className={styles.artHeader} role="img" aria-label="Krys Leagues Masters, Cherry Blossom major tournament" />
      <header className={styles.liveHeader}><div><p>KRYS LEAGUES · MAJORS SERIES</p><h1 id="masters-live-title">MASTERS LIVE SCORE TRACKER</h1></div><span><i /> LIVE</span></header>
      <div className={styles.legend}><p>{data.notice || "Submitted scores appear provisionally until an authorized admin verifies them."}</p><p><b className={styles.verifiedDot} /> VERIFIED <b className={styles.provisionalDot} /> PROVISIONAL</p></div>
      <div className={styles.tableScroll}><table><thead><tr><th>POSITION</th><th>PLAYER</th><th>ROUND 1<br /><small>TO PAR</small></th><th>ROUND 2<br /><small>TO PAR</small></th><th>ROUND 3<br /><small>TO PAR</small></th><th>FINAL ROUND<br /><small>TO PAR</small></th><th>OVERALL<br /><small>TO PAR</small></th></tr></thead><tbody>{rows.map((row) => <tr key={row.entryId} data-provisional={row.provisional || undefined}><td>{row.overallPlace || "—"}</td><th><button type="button" onClick={() => setSelectedPlayerId(row.playerId)}>{row.name}{row.provisional && <span>PROVISIONAL</span>}</button></th>{([1, 2, 3, 4] as MastersRoundNumber[]).map((round) => <td key={round}><Score value={row.rounds[round].toPar} status={row.rounds[round].status} /></td>)}<td className={styles.overall}><Score value={row.overallTotal} status={row.overallTotal === null ? null : row.provisional ? "submitted" : "verified"} /></td></tr>)}</tbody></table></div>
      <div className={styles.artFooter} role="img" aria-label="Krys Leagues Masters trophy and branding" />
    </section>
    <p className={styles.fieldNote}>Complete Masters field · An em dash means that round has not been recorded.</p>
  </div>{selectedRow && <PlayerDetail row={selectedRow} cards={selectedCards} onClose={() => setSelectedPlayerId(null)} />}</main>
}

function Score({ value, status }: { value: number | null; status: MajorPlayerScorecard["status"] | null }) {
  const provisional = value !== null && status !== null && status !== "verified"
  return <span className={provisional ? styles.provisionalScore : styles.score}>{formatMastersLiveScore(value)}{provisional && <small aria-label="provisional">P</small>}</span>
}

function PlayerDetail({ row, cards, onClose }: { row: MastersLiveRow; cards: MajorPlayerScorecard[]; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null), priorFocus = useRef<HTMLElement | null>(null)
  useEffect(() => { priorFocus.current = document.activeElement as HTMLElement | null; closeRef.current?.focus(); const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }; window.addEventListener("keydown", keydown); return () => { window.removeEventListener("keydown", keydown); priorFocus.current?.focus() } }, [onClose])
  return <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className={styles.detail} role="dialog" aria-modal="true" aria-labelledby="masters-player-detail"><button ref={closeRef} type="button" onClick={onClose}>CLOSE</button><p>MASTERS PLAYER DETAIL</p><h2 id="masters-player-detail">{row.name}</h2><div className={styles.detailRounds}>{([1, 2, 3, 4] as MastersRoundNumber[]).map((round) => { const card = cards.find((item) => item.day_number === round); return <article key={round}><span>{majorRoundDayLabel(round)}</span><strong>{formatMastersLiveScore(row.rounds[round].toPar)}</strong><small>{!card ? "NOT PLAYED" : card.status === "verified" ? "VERIFIED" : "PROVISIONAL"}</small></article> })}<article className={styles.detailOverall}><span>OVERALL</span><strong>{formatMastersLiveScore(row.overallTotal)}</strong><small>{row.overallTotal === null ? "NOT YET RANKED" : row.provisional ? "PROVISIONAL" : "VERIFIED"}</small></article></div></section></div>
}
