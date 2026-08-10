"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

type ApprovedSeason = { season_id: string; season_number: number; division_count: number }
type ScorecardEntry = {
  season_id: string
  season_number: number
  division_number: number
  division_rank: number
  player_id: string
  player_screen_name: string
  completed_game_count: number
  wins: number
  losses: number
  ties: number
  points: number
  holes_won: number
}

export default function PypStandingsPage() {
  const [seasons, setSeasons] = useState<ApprovedSeason[]>([])
  const [seasonId, setSeasonId] = useState("")
  const [division, setDivision] = useState(1)
  const [entries, setEntries] = useState<ScorecardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  useEffect(() => {
    async function loadSeasons() {
      const { data, error } = await supabase.rpc("list_public_pyp_final_scorecard_seasons")
      if (error) { setMessage(error.message); setLoading(false); return }
      const approved = (data || []) as ApprovedSeason[]
      setSeasons(approved)
      setSeasonId(approved[0]?.season_id || "")
      if (approved.length === 0) { setMessage("No approved managed PYP seasons are available yet."); setLoading(false) }
    }
    void loadSeasons()
  }, [])

  useEffect(() => {
    if (!seasonId) return
    async function loadScorecard() {
      setLoading(true); setMessage("")
      const { data, error } = await supabase.rpc("get_public_pyp_final_scorecard", { p_season_id: seasonId })
      if (error) { setEntries([]); setMessage(error.message); setLoading(false); return }
      setEntries((data || []) as ScorecardEntry[])
      setLoading(false)
    }
    void loadScorecard()
  }, [seasonId])

  const selectedSeason = seasons.find((season) => season.season_id === seasonId)
  const divisions = Array.from({ length: selectedSeason?.division_count || 0 }, (_, index) => index + 1)
  const shown = useMemo(() => entries.filter((entry) => entry.division_number === division), [division, entries])

  function changeSeason(id: string) {
    setSeasonId(id)
    setDivision(1)
  }

  return <main style={page}><div style={container}>
    <Link href="/pyp" style={backButton}>← PYP</Link>
    <section style={hero}>
      <h1 style={title}>PYP Standings</h1>
      <p style={subtitle}>Approved managed PYP Final Scorecard history.</p>
      <div style={controls}>
        <label style={label}>Season<select value={seasonId} onChange={(event) => changeSeason(event.target.value)} style={input}>
          {seasons.map((season) => <option key={season.season_id} value={season.season_id}>Season {season.season_number}</option>)}
        </select></label>
        <label style={label}>Division<select value={division} onChange={(event) => setDivision(Number(event.target.value))} style={input}>
          {divisions.map((number) => <option key={number} value={number}>PYP D{number}</option>)}
        </select></label>
      </div>
    </section>
    {loading ? <div style={messageCard}>Loading approved standings...</div>
      : shown.length === 0 ? <div style={messageCard}>{message || "No approved players are recorded for this division."}</div>
      : <div style={tableWrap}><table style={table}><thead><tr>
        <th style={th}>Rank</th><th style={th}>Player</th><th style={th}>Played</th><th style={th}>Wins</th>
        <th style={th}>Draws</th><th style={th}>Losses</th><th style={th}>Points</th><th style={th}>Holes Won</th>
      </tr></thead><tbody>{shown.map((entry) => <tr key={entry.player_id}>
        <td style={td}>{entry.division_rank}</td><td style={playerCell}>{entry.player_screen_name}</td>
        <td style={td}>{entry.completed_game_count}</td><td style={td}>{entry.wins}</td><td style={td}>{entry.ties}</td>
        <td style={td}>{entry.losses}</td><td style={playerCell}>{entry.points}</td><td style={td}>{entry.holes_won}</td>
      </tr>)}</tbody></table></div>}
  </div></main>
}

const page: React.CSSProperties = { minHeight: "100vh", background: "radial-gradient(circle at top, #172554 0%, #020617 48%, #000 100%)", color: "white", padding: "30px 18px" }
const container: React.CSSProperties = { width: "100%", maxWidth: 1100, margin: "0 auto" }
const backButton: React.CSSProperties = { display: "inline-block", marginBottom: 18, padding: "10px 16px", background: "#1e293b", border: "1px solid #475569", borderRadius: 10, color: "white", textDecoration: "none", fontWeight: 700 }
const hero: React.CSSProperties = { padding: 26, background: "rgba(2,6,23,.9)", border: "1px solid #334155", borderRadius: 20, marginBottom: 20 }
const title: React.CSSProperties = { margin: 0, fontSize: 42 }
const subtitle: React.CSSProperties = { color: "#cbd5e1", fontSize: 18, lineHeight: 1.5 }
const controls: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }
const label: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8, fontWeight: 700 }
const input: React.CSSProperties = { padding: 12, borderRadius: 10, border: "1px solid #475569", background: "#0f172a", color: "white" }
const messageCard: React.CSSProperties = { padding: 20, borderRadius: 14, border: "1px solid #334155", background: "#0f172a" }
const tableWrap: React.CSSProperties = { overflowX: "auto", border: "1px solid #334155", borderRadius: 14 }
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", background: "#0f172a" }
const th: React.CSSProperties = { padding: 13, textAlign: "left", borderBottom: "1px solid #334155", color: "#cbd5e1" }
const td: React.CSSProperties = { padding: 13, borderBottom: "1px solid #1e293b" }
const playerCell: React.CSSProperties = { ...td, fontWeight: 800 }
