"use client"

import { useEffect, useMemo, useState } from "react"
import { strokeDivisionAccent } from "@/lib/playerDashboard"
import styles from "./PublicStrokeBoard.module.css"

type Fixture = {
  id: string
  season_number: number | null
  division: string | null
  game: string | number | null
  course: string | null
  player1: string | null
  player2: string | null
  player1_name: string | null
  player2_name: string | null
  player1_id: string | null
  player2_id: string | null
}

type Standing = {
  player_id: string
  season_number: number | null
  division: string | null
  rank: number | null
  wins: number | null
  losses: number | null
  ties: number | null
  points: number | null
  strokes: number | null
}

type BoardPayload = {
  fixtures?: Fixture[]
  standings?: Standing[]
  names?: Record<string, string | null>
  currentSeason?: number | null
  error?: string
}

function divisionNumber(value: string | null) {
  const match = value?.match(/(\d+)/)
  return match ? Number(match[1]) : 99
}

export function PublicStrokeBoard() {
  const [payload, setPayload] = useState<BoardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    fetch("/api/public/league-board?kind=stroke", { cache: "no-store" })
      .then(async (response) => {
        const next = await response.json() as BoardPayload
        if (!response.ok) throw new Error(next.error || "This public Stroke board is temporarily unavailable.")
        if (!cancelled) setPayload(next)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "This public Stroke board is temporarily unavailable.")
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const names = useMemo(() => new Map(Object.entries(payload?.names || {}).filter((entry): entry is [string, string] => typeof entry[1] === "string")), [payload?.names])
  const season = payload?.currentSeason ?? null
  const fixtures = (payload?.fixtures || []).filter((row) => row.season_number === season)
  const standings = (payload?.standings || []).filter((row) => row.season_number === season)
  const divisions = Array.from(new Set([
    ...fixtures.map((row) => row.division),
    ...standings.map((row) => row.division),
  ].filter((value): value is string => Boolean(value)))).sort((a, b) => divisionNumber(a) - divisionNumber(b))
  const displayName = (id: string | null, fallback: string | null) => (id && names.get(id)) || fallback || "Unknown Player"

  return <section className={styles.board} aria-label="Stroke public board">
    <header className={styles.boardHeader}>
      <div>
        <p className={styles.kicker}>CURRENT SEASON</p>
        <h2>STROKE PLAY</h2>
        <p className={styles.subtitle}>{season ? `Season ${season} · Live divisions` : "Live division boards"}</p>
      </div>
      <span className={styles.live}>LIVE</span>
    </header>
    {loading ? <p className={styles.message}>Loading Stroke divisions…</p> : error ? <p className={styles.message}>{error}</p> : !season ? <p className={styles.message}>No current Stroke season is configured.</p> : divisions.length === 0 ? <p className={styles.message}>No current Stroke divisions are available.</p> : <div className={styles.divisions}>
      {divisions.map((division) => {
        const accent = strokeDivisionAccent(divisionNumber(division))
        const divisionFixtures = fixtures.filter((row) => row.division === division).sort((a, b) => Number(a.game || 0) - Number(b.game || 0))
        const divisionStandings = standings.filter((row) => row.division === division).sort((a, b) => Number(a.rank || 999) - Number(b.rank || 999))
        return <article className={styles.division} style={{ "--accent": accent } as React.CSSProperties} key={division}>
          <header className={styles.divisionHeader}><div><p className={styles.kicker}>DIVISION BOARD</p><h3>STROKE DIVISION {divisionNumber(division)}</h3></div><span className={styles.divisionSeason}>SEASON {season}</span></header>
          <section className={styles.schedule}>
            <h4>WHO PLAYS WHO</h4>
            {divisionFixtures.length === 0 ? <p className={styles.muted}>No scheduled games recorded.</p> : divisionFixtures.map((fixture) => <div className={styles.fixture} key={fixture.id}>
              <span className={styles.game}>GAME {fixture.game ?? "—"}</span>
              <div className={styles.players}><strong>{displayName(fixture.player1_id, fixture.player1_name || fixture.player1)}</strong><span>vs</span><strong>{displayName(fixture.player2_id, fixture.player2_name || fixture.player2)}</strong></div>
              <span className={styles.course}>{fixture.course || "Course not assigned"}</span>
            </div>)}
          </section>
          <section className={styles.standings}><h4>OVERALL STANDINGS</h4>{divisionStandings.length === 0 ? <p className={styles.muted}>No saved standings recorded for this division.</p> : <ol>{divisionStandings.map((row) => <li key={`${division}-${row.player_id}`}><span className={styles.rank}>{row.rank ?? "—"}</span><strong>{displayName(row.player_id, null)}</strong><span>{Number(row.points || 0)} pts · {Number(row.wins || 0)}W · {Number(row.ties || 0)}T · {Number(row.losses || 0)}L · {Number(row.strokes || 0)} strokes</span></li>)}</ol>}</section>
        </article>
      })}
    </div>}
  </section>
}
