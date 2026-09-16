"use client"

import { useEffect, useState } from "react"
import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import TrophyMedia from "@/components/TrophyMedia"
import { matchPlayArtwork } from "@/lib/artworkPageMaps"
import { supabase } from "@/lib/supabase"
import { publicMatchDivisions, publicMatchDisplayRank, type PublicMatchPayload } from "@/lib/publicMatch"
import styles from "./match-play.module.css"

type PublicMatchTrophy = {
  id: string
  playerName: string
  trophy_title: string | null
  placement: string | null
  event_name: string | null
  division: string | null
  season: string | null
  week: string | null
  image_url: string | null
  league_type: string | null
}

type DisplayRow = {
  division: number
  rank: number
  name: string
  played: number
  wins: number
  losses: number
  draws: number
  points: number
  holesWon: number
}

type DisplayMatchup = {
  division: number
  gameNumber: number
  player1: string | null
  player2: string | null
  course: string | null
}

const DIVISION_THEMES: Record<number, { accent: string; soft: string; label: string }> = {
  1: { accent: "#fb923c", soft: "rgba(154, 52, 18, .22)", label: "ORANGE" },
  2: { accent: "#4ade80", soft: "rgba(21, 128, 61, .22)", label: "GREEN" },
  3: { accent: "#60a5fa", soft: "rgba(29, 78, 216, .22)", label: "BLUE" },
  4: { accent: "#facc15", soft: "rgba(161, 98, 7, .22)", label: "GOLD" },
  5: { accent: "#c084fc", soft: "rgba(126, 34, 206, .22)", label: "PURPLE" },
}

export default function MatchPlayPage() {
  const [data, setData] = useState<PublicMatchPayload | null>(null)
  const [trophies, setTrophies] = useState<PublicMatchTrophy[]>([])
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false

    async function loadPage() {
      const [matchResponse, trophiesResponse] = await Promise.all([
        supabase.rpc("get_public_match_play"),
        fetch("/api/champions/public?scope=all", { cache: "no-store" }),
      ])

      if (cancelled) return

      if (matchResponse.error) {
        setError("Match Play is temporarily unavailable.")
        setLoading(false)
        return
      }

      const loaded = matchResponse.data as PublicMatchPayload
      setData(loaded)

      if (!trophiesResponse.ok) throw new Error("Trophy source failed")
      const trophyPayload = await trophiesResponse.json() as { trophies?: PublicMatchTrophy[] }
      setTrophies(trophyPayload.trophies || [])

      setSelectedSeason(loaded.current.season_number ?? loaded.historical_seasons[0]?.season_number ?? null)
      setLoading(false)
    }

    void loadPage().catch(() => {
      if (cancelled) return
      setError("Match Play is temporarily unavailable.")
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [])

  const seasonOptions = (() => {
    if (!data) return []
    const current = data.current.season_number === null ? [] : [data.current.season_number]
    const older = [...new Set(data.historical_seasons.map((season) => season.season_number))]
      .filter((seasonNumber) => seasonNumber !== data.current.season_number)
      .sort((left, right) => right - left)
    return [...current, ...older].map((seasonNumber) => ({ seasonNumber, current: seasonNumber === data.current.season_number }))
  })()

  const currentSeason = data?.current.season_number ?? null
  const showingCurrent = selectedSeason !== null && selectedSeason === currentSeason

  const rows: DisplayRow[] = (() => {
    if (!data || selectedSeason === null) return []

    if (showingCurrent) {
      return data.current.standings.map((row) => ({
        division: row.division_number,
        rank: publicMatchDisplayRank(row.rank, row.starting_rank),
        name: row.player_screen_name,
        played: row.played,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        points: row.points,
        holesWon: row.holes_won,
      }))
    }

    return data.historical_standings
      .filter((row) => row.season_number === selectedSeason)
      .map((row) => ({
        division: row.division_number,
        rank: row.source_final_rank,
        name: row.historical_display_name,
        played: row.played,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        points: row.points,
        holesWon: row.holes_won,
      }))
  })()

  const divisions = (() => {
    if (!data || selectedSeason === null) return []
    if (showingCurrent && data.current.division_count) {
      return Array.from({ length: data.current.division_count }, (_, index) => index + 1)
    }
    return publicMatchDivisions(rows.map((row) => ({ division_number: row.division })))
  })()

  const selectedSeasonTrophies = trophies.filter((trophy) => isMatchTrophyForSeason(trophy, selectedSeason))

  const selectedMatchups: DisplayMatchup[] = showingCurrent
    ? (data?.current.schedule || []).filter((row) => row.season_number === selectedSeason).map((row) => ({
      division: row.division_number,
      gameNumber: row.game_number,
      player1: row.player1_display_name,
      player2: row.player2_display_name,
      course: row.course,
    }))
    : (data?.historical_matchups || []).filter((row) => row.season_number === selectedSeason).map((row) => ({
      division: row.division_number,
      gameNumber: row.game_number,
      player1: row.player1_historical_display_name,
      player2: row.player2_historical_display_name,
      course: row.historical_course_name,
    }))

  return (
    <div className={styles.page}>
      <ArtworkNavigation
        definition={matchPlayArtwork}
        hiddenTargetIds={["matches-and-results", "classic-standings"]}
        overlay={<div className={styles.heroNavMask} aria-hidden="true" />}
      />

      <div className={styles.edgeNoteLeft} aria-hidden="true">MATCH / PLAY</div>
      <div className={styles.edgeNoteRight} aria-hidden="true">HEAD · TO · HEAD</div>

      <main className={styles.shell}>
        {loading && <div className={styles.message}>Loading Match Play…</div>}
        {error && <div className={styles.message} role="alert">{error}</div>}

        {!loading && !error && data && (
          <>
            <section className={styles.seasonBar} aria-label="Season selection">
              <div>
                <p className={styles.eyebrow}>MATCH PLAY SEASONS</p>
                <h2>Choose a season</h2>
                <p>Every division, every matchup, one scrollable season page.</p>
              </div>
              <label className={styles.seasonSelect}>
                <span className={styles.srOnly}>Season</span>
                <select value={selectedSeason ?? ""} onChange={(event) => setSelectedSeason(Number(event.target.value))}>
                  {seasonOptions.map((option) => (
                    <option value={option.seasonNumber} key={option.seasonNumber}>
                      Season {option.seasonNumber}{option.current ? " — Current" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            {selectedSeasonTrophies.length > 0 && <TrophySection trophies={selectedSeasonTrophies} />}

            <section className={styles.seasonIntro}>
              <div>
                <p className={styles.eyebrow}>{showingCurrent ? "LIVE LEAGUE" : "SEASON RECORD"}</p>
                <h1>Season {selectedSeason}</h1>
                <p>{showingCurrent ? "Approved Match roster, managed schedule, and current overall totals." : "Published standings and matchup records for this season."}</p>
              </div>
              {showingCurrent && <span className={styles.currentBadge}>CURRENT</span>}
            </section>

            {divisions.length === 0 ? (
              <div className={styles.empty}>No standings are available for this season.</div>
            ) : (
              <div className={styles.divisionStack}>
                {divisions.map((division) => {
                  const theme = DIVISION_THEMES[division] || { accent: "#cbd5e1", soft: "rgba(71, 85, 105, .25)", label: "MATCH" }
                  const divisionRows = rows.filter((row) => row.division === division)
                  const divisionMatchups = selectedMatchups.filter((row) => row.division === division)

                  return (
                    <section className={styles.divisionSection} style={{ "--division-accent": theme.accent, "--division-soft": theme.soft } as React.CSSProperties} key={division}>
                      <div className={styles.divisionHeading}>
                        <div>
                          <span className={styles.divisionOverline}>DIVISION {division} · {theme.label}</span>
                          <h2>Match D{division}</h2>
                        </div>
                        <span className={styles.divisionMark} aria-hidden="true">D{division}</span>
                      </div>

                      {divisionMatchups.length > 0 && <MatchupSection schedule={divisionMatchups} />}

                      <div className={styles.standingsBlock}>
                        <div className={styles.standingsHeading}>
                          <span className={styles.sectionEyebrow}>CURRENT STANDINGS</span>
                          <span className={styles.standingsRule} aria-hidden="true" />
                        </div>
                        <StandingsTable rows={divisionRows} />
                      </div>
                    </section>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function TrophySection({ trophies }: { trophies: PublicMatchTrophy[] }) {
  return (
    <section className={styles.trophySection} aria-labelledby="season-trophies-title">
      <div className={styles.trophyHeader}>
        <div>
          <p className={styles.eyebrow}>WINNERS CIRCLE</p>
          <h2 id="season-trophies-title">Season trophies</h2>
        </div>
        <span className={styles.trophySpark} aria-hidden="true">✦</span>
      </div>
      <div className={styles.trophyGrid}>
        {trophies.map((trophy) => (
          <article className={styles.trophyCard} key={trophy.id}>
            {trophy.image_url && <TrophyMedia src={trophy.image_url} alt="" className={styles.trophyImage} />}
            <div>
              <strong>{trophy.playerName}</strong>
              <span>{trophy.trophy_title || trophy.placement || "Season winner"}</span>
              {(trophy.division || trophy.event_name) && <small>{[trophy.division, trophy.event_name].filter(Boolean).join(" · ")}</small>}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function MatchupSection({ schedule }: { schedule: DisplayMatchup[] }) {
  return (
    <div className={styles.matchupBlock}>
      <div className={styles.matchupHeader}>
        <span className={styles.sectionEyebrow}>WHO PLAYS WHO</span>
        <span className={styles.matchupLines} aria-hidden="true">× × ×</span>
      </div>
      <div className={styles.matchupList}>
        {schedule.map((match) => (
          <div className={styles.matchupRow} key={`${match.gameNumber}:${match.player1}:${match.player2}`}>
            <div className={styles.matchPlayers}>
              <strong>{displayScheduleName(match.player1)}</strong>
              <span>vs</span>
              <strong>{displayScheduleName(match.player2)}</strong>
            </div>
            <div className={styles.courseCell}>
              <span>{gameLabel(match.gameNumber)}</span>
              <strong>{match.course?.trim() || "Course not set"}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StandingsTable({ rows }: { rows: DisplayRow[] }) {
  return (
    <div className={styles.tableWrap}>
      <table>
        <thead><tr><th>Rank</th><th>Player</th><th>Played</th><th>Wins</th><th>Losses</th><th>Draws</th><th>Points</th><th>HW</th></tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td className={styles.noRows} colSpan={8}>No rostered players listed for this division.</td></tr> : rows.map((row) => (
            <tr key={`${row.rank}:${row.name}`}>
              <td data-label="Rank" className={styles.rank}>{row.rank}</td>
              <td data-label="Player" className={styles.player}>{row.name}</td>
              <td data-label="Played">{row.played}</td>
              <td data-label="Wins">{row.wins}</td>
              <td data-label="Losses">{row.losses}</td>
              <td data-label="Draws">{row.draws}</td>
              <td data-label="Points" className={styles.points}>{row.points}</td>
              <td data-label="HW">{row.holesWon}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function displayScheduleName(name: string | null) {
  return name?.trim() || "Player name unavailable"
}

function gameLabel(gameNumber: number) {
  return `GAME ${gameNumber}`
}

function isMatchTrophyForSeason(trophy: PublicMatchTrophy, season: number | null) {
  if (season === null) return false
  const text = [trophy.league_type, trophy.event_name, trophy.trophy_title, trophy.division, trophy.season]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return (trophy.league_type?.trim().toLowerCase() === "match" || text.includes("match play")) && new RegExp(`\\b${season}\\b`).test(text)
}
