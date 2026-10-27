"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import styles from "./PublicLeagueBoard.module.css"

type Season = { season_id: string; season_number: number; division_count: number; source: "managed" | "historical" }
type Entry = { season_id: string; division_number: number; division_rank: number; player_screen_name: string; completed_game_count: number; wins: number; losses: number; ties: number; points: number; holes_won: number }

export function PublicPypBoard() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [seasonId, setSeasonId] = useState("")
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [managed, historical] = await Promise.all([
        supabase.rpc("list_public_pyp_final_scorecard_seasons"),
        supabase.rpc("list_public_historical_pyp_seasons"),
      ])
      if (cancelled) return
      if (managed.error && historical.error) { setError("PYP is temporarily unavailable."); setLoading(false); return }
      const rows: Season[] = [
        ...((managed.data || []) as Omit<Season, "source">[]).map((row) => ({ ...row, source: "managed" as const })),
        ...((historical.data || []) as Omit<Season, "source">[]).map((row) => ({ ...row, source: "historical" as const })),
      ].sort((a, b) => b.season_number - a.season_number || a.source.localeCompare(b.source))
      setSeasons(rows)
      setSeasonId(rows[0]?.season_id || "")
      if (rows.length === 0) setError("No approved PYP seasons are available yet.")
      setLoading(false)
    }
    void load().catch(() => { if (!cancelled) { setError("PYP is temporarily unavailable."); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!seasonId) return
    let cancelled = false
    const selected = seasons.find((row) => row.season_id === seasonId)
    void (selected?.source === "historical"
      ? supabase.rpc("get_public_historical_pyp_final_scorecard", { p_season_id: seasonId })
      : supabase.rpc("get_public_pyp_final_scorecard", { p_season_id: seasonId }))
      .then(({ data, error: responseError }) => {
        if (cancelled) return
        if (responseError) setError("PYP standings are temporarily unavailable.")
        else { setError(""); setEntries((data || []) as Entry[]) }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [seasonId, seasons])

  const selected = seasons.find((row) => row.season_id === seasonId)
  const divisions = useMemo(() => Array.from({ length: selected?.division_count || 0 }, (_, index) => index + 1), [selected])

  return <section className={styles.board} aria-label="PYP public board">
    <div className={styles.boardHeader}><div><p className={styles.eyebrow}>LIVE PUBLIC BOARD</p><h2>Pick Your Poison</h2></div><label className={styles.seasonPicker}>Season<select value={seasonId} onChange={(event) => setSeasonId(event.target.value)}>{seasons.map((row) => <option key={row.season_id} value={row.season_id}>Season {row.season_number}{row === seasons[0] ? " · Current" : ""}</option>)}</select></label></div>
    {loading ? <p className={styles.message}>Loading live PYP standings…</p> : error ? <p className={styles.message}>{error}</p> : <div className={styles.divisions}>{divisions.map((division) => { const rows = entries.filter((entry) => entry.division_number === division).sort((a, b) => a.division_rank - b.division_rank); return <article className={styles.division} key={division}><header><h3>PYP DIVISION {division}</h3><span>Season {selected?.season_number}</span></header><div className={styles.standings}><h4>CURRENT STANDINGS</h4>{rows.length === 0 ? <p className={styles.muted}>No approved players are recorded for this division.</p> : <ol>{rows.map((row) => <li key={`${row.division_number}-${row.player_screen_name}`}><span>{row.player_screen_name}</span><span>{row.points} pts · {row.holes_won} holes won</span></li>)}</ol>}</div></article> })}</div>}
  </section>
}
