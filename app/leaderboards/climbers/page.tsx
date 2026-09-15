"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { EMPTY_PUBLIC_CLIMBERS_PAYLOAD, normalizePublicClimbersPayload, type PublicClimbersPayload } from "@/lib/publicClimbers"
import { formatClimbersDateRange, formatClimbersSeasonLabel } from "@/lib/climbersDisplay"

import styles from "./page.module.css"

const statusLabel = (status: string) => status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())

export default function PublicClimbersPage() {
  const [payload, setPayload] = useState<PublicClimbersPayload>(EMPTY_PUBLIC_CLIMBERS_PAYLOAD)
  const [seasonId, setSeasonId] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void fetch("/api/climbers/public", { cache: "no-store" })
      .then(async (response) => normalizePublicClimbersPayload(await response.json()))
      .then((next) => { setPayload(next); setSeasonId(next.current_season_id ?? "") })
      .catch(() => setPayload({ ...EMPTY_PUBLIC_CLIMBERS_PAYLOAD, error: "Public Climbers data could not be loaded right now." }))
      .finally(() => setLoading(false))
  }, [])

  const season = useMemo(() => payload.seasons.find((item) => item.id === seasonId) ?? null, [payload.seasons, seasonId])

  return <main className={styles.page}><div className={styles.shell}><nav className={styles.nav}><Link href="/records" className={styles.navLink}>← League records</Link><Link href="/" className={styles.navLink}>Krys Leagues</Link></nav><section className={styles.tribute} aria-labelledby="yuk1n-tribute-title"><div className={styles.tributeImage}><Image src="/recognition/yuk1n.png" alt="YUK1N avatar" width={360} height={640} priority /></div><div className={styles.tributeCopy}><p className={styles.eyebrow}>The Climbers program</p><h1 id="yuk1n-tribute-title">THANK YOU, YUK1N</h1><p>Thank you, YUK1N, for your years of amazing work running the Krys Leagues All-Time Leaderboards and for developing Climbers.</p><p>Your time, dedication, and work helped build something that has become an important part of Krys Leagues.</p><p>Although you have retired from running the All-Time Leaderboards, the Climbers program you created will continue on.</p></div></section><header className={styles.header}><p className={styles.eyebrow}>Overall Leaderboards · Easy + Hard movement</p><h2>Climbers</h2><p>One combined leaderboard for legitimate PB improvements. Points reflect canonical people actually passed; ties do not count.</p></header>{payload.error && <p className={styles.error} role="alert">{payload.error}</p>}<section className={styles.board} aria-labelledby="climbers-board-title"><div className={styles.toolbar}><div><h2 id="climbers-board-title">{season ? formatClimbersSeasonLabel(season.label, season.starts_at, season.ends_at) : "Climbers Season"}</h2>{season && <p>{formatClimbersDateRange(season.starts_at, season.ends_at)} · {statusLabel(season.status)}</p>}</div><label className={styles.selectLabel}>Season<select value={seasonId} onChange={(event) => setSeasonId(event.target.value)}><option value="">Choose a season</option>{payload.seasons.map((item) => <option key={item.id} value={item.id}>{formatClimbersSeasonLabel(item.label, item.starts_at, item.ends_at)} · {statusLabel(item.status)}</option>)}</select></label></div>{loading && <p className={styles.empty}>Loading real Climbers standings…</p>}{!loading && season?.winner_names.length ? <p className={styles.winner}><strong>Climber of the Season:</strong> {season.winner_names.join(" · ")} · {season.standings[0]?.points ?? 0} points</p> : null}{!loading && season && season.standings.length > 0 ? <div className={styles.tableWrap}><table><thead><tr><th>Rank</th><th>Player</th><th>Points</th><th>PB improvements</th></tr></thead><tbody>{season.standings.map((row, index) => <tr key={row.player_id}><td>#{index + 1}</td><td><Link href={`/players/${row.player_id}`}>{row.screen_name}</Link></td><td>{row.points}</td><td>{row.event_count}</td></tr>)}</tbody></table></div> : null}{!loading && (!season || season.standings.length === 0) && <p className={styles.empty}>No public Climbers events are available for this season yet.</p>}</section></div></main>
}
