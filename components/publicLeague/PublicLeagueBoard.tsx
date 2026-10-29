"use client"

import { useEffect, useMemo, useState } from "react"
import { loadCanonicalPlayerDisplays } from "@/lib/canonicalPlayerDisplay"
import { supabase } from "@/lib/supabase"
import styles from "./PublicLeagueBoard.module.css"

type LeagueKind = "stroke" | "doubles" | "pro" | "skins"

type Fixture = {
  id: string
  season_number: number | null
  division: string | null
  game: string | number | null
  course: string | null
  player1: string | null
  player2: string | null
  player1_id: string | null
  player2_id: string | null
}

type Result = {
  id: string
  schedule_id: string | null
  season_number: number | null
  division: string | null
  game: string | number | null
  player1: string | null
  player2: string | null
  player1_id: string | null
  player2_id: string | null
  player1_score: number | null
  player2_score: number | null
  is_draw: boolean | null
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

const LABELS: Record<LeagueKind, string> = {
  stroke: "Stroke Play",
  doubles: "Doubles",
  pro: "Amateur → Pro",
  skins: "Skins",
}

const LEAGUE_TYPES: Record<LeagueKind, string> = {
  stroke: "stroke",
  doubles: "doubles",
  pro: "pro",
  skins: "skins",
}

export function PublicLeagueBoard({ kind }: { kind: LeagueKind }) {
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [standings, setStandings] = useState<Standing[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [season, setSeason] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError("")
      const leagueType = LEAGUE_TYPES[kind]
      const [fixturesResponse, resultsResponse, standingsResponse] = await Promise.all([
        supabase
          .from("schedule")
          .select("id,season_number,division,game,course,player1,player2,player1_id,player2_id")
          .eq("league_type", leagueType)
          .order("season_number", { ascending: false })
          .order("division", { ascending: true })
          .order("game", { ascending: true }),
        supabase
          .from("results")
          .select("id,schedule_id,season_number,division,game,player1,player2,player1_id,player2_id,player1_score,player2_score,is_draw")
          .eq("league_type", leagueType),
        supabase
          .from("season_standings")
          .select("player_id,season_number,division,rank,wins,losses,ties,points,strokes")
          .eq("league_type", leagueType)
          .order("season_number", { ascending: false })
          .order("rank", { ascending: true }),
      ])

      if (cancelled) return
      const firstError = fixturesResponse.error || resultsResponse.error || standingsResponse.error
      if (firstError) {
        setError("This public league board is temporarily unavailable.")
        setLoading(false)
        return
      }

      const loadedFixtures = (fixturesResponse.data || []) as Fixture[]
      const loadedResults = (resultsResponse.data || []) as Result[]
      const loadedStandings = (standingsResponse.data || []) as Standing[]
      const ids = Array.from(new Set([
        ...loadedFixtures.flatMap((row) => [row.player1_id, row.player2_id]),
        ...loadedResults.flatMap((row) => [row.player1_id, row.player2_id]),
        ...loadedStandings.map((row) => row.player_id),
      ].filter((id): id is string => Boolean(id))))
      const playerResponse = await loadCanonicalPlayerDisplays(ids)
      if (cancelled) return
      if (playerResponse.error) {
        setError("Player identities are temporarily unavailable.")
        setLoading(false)
        return
      }

      setFixtures(loadedFixtures)
      setResults(loadedResults)
      setStandings(loadedStandings)
      setNames(new Map(playerResponse.data.map((row) => [row.source_player_id, row.screen_name || "Unknown Player"])))
      const seasons = Array.from(new Set([
        ...loadedFixtures.map((row) => row.season_number),
        ...loadedStandings.map((row) => row.season_number),
      ].filter((value): value is number => typeof value === "number"))).sort((a, b) => b - a)
      setSeason((current) => current && seasons.includes(current) ? current : seasons[0] || null)
      setLoading(false)
    }

    void load().catch(() => {
      if (cancelled) return
      setError("This public league board is temporarily unavailable.")
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [kind])

  const seasons = useMemo(() => {
    const values = [
      ...fixtures.map((row) => row.season_number),
      ...standings.map((row) => row.season_number),
    ].filter((value): value is number => typeof value === "number")
    return Array.from(new Set(values)).sort((a, b) => b - a)
  }, [fixtures, standings])
  const divisions = useMemo(() => {
    const values = [
      ...fixtures.filter((row) => row.season_number === season).map((row) => row.division),
      ...standings.filter((row) => row.season_number === season).map((row) => row.division),
    ].filter((value): value is string => Boolean(value))
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
  }, [fixtures, standings, season])

  function displayName(id: string | null, fallback: string | null) {
    return (id && names.get(id)) || fallback || "Unknown Player"
  }

  function resultFor(fixture: Fixture) {
    return results.find((result) => result.schedule_id === fixture.id) || results.find((result) =>
      result.season_number === fixture.season_number && result.division === fixture.division &&
      String(result.game ?? "") === String(fixture.game ?? "") &&
      ((result.player1_id && result.player1_id === fixture.player1_id) || result.player1 === fixture.player1) &&
      ((result.player2_id && result.player2_id === fixture.player2_id) || result.player2 === fixture.player2))
  }

  return <section className={styles.board} aria-label={`${LABELS[kind]} public board`}>
    <div className={styles.boardHeader}>
      <div><p className={styles.eyebrow}>LIVE PUBLIC BOARD</p><h2>{LABELS[kind]}</h2></div>
      {seasons.length > 0 && <label className={styles.seasonPicker}>Season<select value={season || ""} onChange={(event) => setSeason(Number(event.target.value))}>{seasons.map((value) => <option key={value} value={value}>Season {value}{value === seasons[0] ? " · Current" : ""}</option>)}</select></label>}
    </div>
    {loading ? <p className={styles.message}>Loading live league data…</p> : error ? <p className={styles.message}>{error}</p> : !season ? <p className={styles.message}>No public {LABELS[kind]} seasons are available yet.</p> : divisions.length === 0 ? <p className={styles.message}>No divisions are available for Season {season}.</p> : <div className={styles.divisions}>
      {divisions.map((division) => {
        const divisionFixtures = fixtures.filter((row) => row.season_number === season && row.division === division)
        const divisionStandings = standings.filter((row) => row.season_number === season && row.division === division).sort((a, b) => Number(a.rank || 999) - Number(b.rank || 999))
        return <article className={styles.division} key={division}>
          <header><h3>{division}</h3><span>Season {season}</span></header>
          <div className={styles.games}>
            {divisionFixtures.length === 0 ? <p className={styles.muted}>No scheduled games recorded.</p> : divisionFixtures.map((fixture) => {
              const result = resultFor(fixture)
              return <div className={styles.game} key={fixture.id}>
                <div className={styles.gameHeading}><strong>GAME {fixture.game ?? "—"}</strong><span className={result ? styles.complete : styles.pending}>{result ? "COMPLETED" : "NOT PLAYED"}</span></div>
                <div className={styles.matchup}><div><small>HOME</small><b>{displayName(fixture.player1_id, fixture.player1)}</b></div><span>VS</span><div><small>AWAY</small><b>{displayName(fixture.player2_id, fixture.player2)}</b></div></div>
                <p className={styles.course}>Course: {fixture.course || "Course not assigned"}</p>
                {result && <p className={styles.score}>{result.player1_score ?? "—"} · {result.player2_score ?? "—"}</p>}
              </div>
            })}
          </div>
          <div className={styles.standings}><h4>CURRENT STANDINGS</h4>{divisionStandings.length === 0 ? <p className={styles.muted}>No saved standings recorded for this division.</p> : <ol>{divisionStandings.map((row) => <li key={`${division}-${row.player_id}`}><span>{displayName(row.player_id, null)}</span><span>{Number(row.points || 0)} pts</span></li>)}</ol>}</div>
        </article>
      })}
    </div>}
  </section>
}
