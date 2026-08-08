"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

const DIVISIONS = ["Stroke D1", "Stroke D2", "Stroke D3", "Stroke D4", "Stroke D5"]

type SeasonStandingRow = { player_id: string; points: number; wins: number; losses: number; ties: number; strokes: number; rank: number }
type PlayerRow = { id: string; screen_name: string }
type Standing = { player: string; player_id: string; played: number; wins: number; draws: number; losses: number; points: number; strokes: number; rank: number }
type ScorecardRow = { id: string; season_id: string; source_roster_version_id: string; status: "draft" | "approved" | "cancelled"; approved_at: string | null; approval_note: string | null }
type ScorecardEntryRow = { id: string; division_number: number; division_rank: number; player_id: string; player_screen_name: string; completed_game_count: number; wins: number; losses: number; ties: number; points: number; strokes: number }

export default function StrokeStandingsPage() {
  const router = useRouter()
  const [division, setDivision] = useState("Stroke D1")
  const [season, setSeason] = useState("59")
  const [standings, setStandings] = useState<Standing[]>([])
  const [loading, setLoading] = useState(false)
  const [seasonId, setSeasonId] = useState("")
  const [scorecard, setScorecard] = useState<ScorecardRow | null>(null)
  const [entries, setEntries] = useState<ScorecardEntryRow[]>([])
  const [completedFixtures, setCompletedFixtures] = useState(0)
  const [totalFixtures, setTotalFixtures] = useState(0)
  const [scorecardLoading, setScorecardLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [approving, setApproving] = useState(false)
  const [approvalNote, setApprovalNote] = useState("")
  const [scorecardError, setScorecardError] = useState("")
  const [scorecardMessage, setScorecardMessage] = useState("")

  useEffect(() => {
    void loadStandings()
    void loadFinalScorecard()
  }, [division, season])

  async function loadStandings() {
    const seasonNumber = Number(season)
    if (!Number.isInteger(seasonNumber) || seasonNumber <= 0) return
    setLoading(true)

    const { data, error } = await supabase.from("season_standings")
      .select("player_id, points, wins, losses, ties, strokes, rank")
      .eq("league_type", "stroke").eq("division", division)
      .eq("season_number", seasonNumber).order("rank", { ascending: true })

    if (error) { setLoading(false); alert(error.message); return }
    const savedRows = (data || []) as SeasonStandingRow[]
    const playerIds = savedRows.map((row) => row.player_id)
    let playerMap = new Map<string, string>()

    if (playerIds.length > 0) {
      const { data: playerData, error: playerError } = await supabase.from("players")
        .select("id, screen_name").in("id", playerIds)
      if (playerError) { setLoading(false); alert(playerError.message); return }
      playerMap = new Map(((playerData || []) as PlayerRow[]).map((player) => [player.id, player.screen_name]))
    }

    setStandings(savedRows.map((row) => ({
      player: playerMap.get(row.player_id) || "Unknown Player",
      player_id: row.player_id,
      played: Number(row.wins || 0) + Number(row.losses || 0) + Number(row.ties || 0),
      wins: Number(row.wins || 0), draws: Number(row.ties || 0), losses: Number(row.losses || 0),
      points: Number(row.points || 0), strokes: Number(row.strokes || 0), rank: Number(row.rank || 0),
    })))
    setLoading(false)
  }

  async function loadFinalScorecard() {
    const seasonNumber = Number(season)
    setScorecardLoading(true); setScorecardError(""); setSeasonId(""); setScorecard(null); setEntries([])
    setCompletedFixtures(0); setTotalFixtures(0)
    if (!Number.isInteger(seasonNumber) || seasonNumber <= 0) { setScorecardLoading(false); return }

    const { data: seasonData, error: seasonError } = await supabase.from("seasons").select("id")
      .eq("league_type", "stroke").eq("season_number", seasonNumber).maybeSingle()
    if (seasonError || !seasonData) { setScorecardError(seasonError?.message || "Stroke season not found."); setScorecardLoading(false); return }
    setSeasonId(seasonData.id)

    const { data: scorecardData, error: scorecardLoadError } = await supabase.from("stroke_final_scorecards")
      .select("id, season_id, source_roster_version_id, status, approved_at, approval_note")
      .eq("season_id", seasonData.id).in("status", ["draft", "approved"])
    if (scorecardLoadError) { setScorecardError(`Could not load Final Scorecard: ${scorecardLoadError.message}`); setScorecardLoading(false); return }
    const scorecards = (scorecardData || []) as ScorecardRow[]
    const selected = scorecards.find((item) => item.status === "approved") || scorecards.find((item) => item.status === "draft") || null
    if (!selected) { setScorecardLoading(false); return }

    const { data: entryData, error: entryError } = await supabase.from("stroke_final_scorecard_entries")
      .select("id, division_number, division_rank, player_id, player_screen_name, completed_game_count, wins, losses, ties, points, strokes")
      .eq("scorecard_id", selected.id).order("division_number", { ascending: true }).order("division_rank", { ascending: true })
    if (entryError) { setScorecardError(`Could not load Final Scorecard entries: ${entryError.message}`); setScorecardLoading(false); return }

    const { data: fixtureData, error: fixtureError } = await supabase.from("schedule").select("id")
      .eq("league_type", "stroke").eq("season_id", seasonData.id).eq("roster_version_id", selected.source_roster_version_id)
    if (fixtureError) { setScorecardError(`Could not load fixture progress: ${fixtureError.message}`); setScorecardLoading(false); return }
    const fixtureIds = (fixtureData || []).map((fixture) => fixture.id)
    let completedCount = 0

    if (fixtureIds.length > 0) {
      const { data: resultData, error: resultError } = await supabase.from("results")
        .select("schedule_id, player1_score, player2_score").eq("league_type", "stroke").in("schedule_id", fixtureIds)
      if (resultError) { setScorecardError(`Could not load result progress: ${resultError.message}`); setScorecardLoading(false); return }
      completedCount = (resultData || []).filter((result) => result.player1_score !== null && result.player2_score !== null).length
    }

    setScorecard(selected); setEntries((entryData || []) as ScorecardEntryRow[])
    setTotalFixtures(fixtureIds.length); setCompletedFixtures(completedCount)
    setApprovalNote(selected.approval_note || ""); setScorecardLoading(false)
  }

  async function generateFinalScorecard() {
    if (!seasonId) return
    setGenerating(true); setScorecardError(""); setScorecardMessage("")
    const { error } = await supabase.rpc("generate_stroke_final_scorecard", { p_season_id: seasonId })
    if (error) { setScorecardError(`Final Scorecard generation failed: ${error.message}`); setGenerating(false); return }
    await loadFinalScorecard(); setScorecardMessage("Draft Final Scorecard generated. Review it before approval."); setGenerating(false)
  }

  async function approveFinalScorecard() {
    if (!scorecard || scorecard.status !== "draft") return
    if (!window.confirm("Approve and permanently freeze this Final Scorecard?")) return
    setApproving(true); setScorecardError(""); setScorecardMessage("")
    const { error } = await supabase.rpc("approve_stroke_final_scorecard", {
      p_final_scorecard_id: scorecard.id, p_approval_note: approvalNote,
    })
    if (error) { setScorecardError(`Final Scorecard approval failed: ${error.message}`); setApproving(false); return }
    await loadFinalScorecard(); setScorecardMessage("Final Scorecard approved and frozen. The source roster is now locked."); setApproving(false)
  }

  return (
    <main style={page}><div style={container}>
      <div style={topBar}><button onClick={() => router.push("/admin/stroke")} style={backButton}>← Back to Stroke</button></div>
      <h1 style={title}>Stroke Standings</h1>
      <p style={subtitle}>This page reads authoritative saved standings from season_standings.</p>
      <div style={controls}>
        <select value={division} onChange={(event) => setDivision(event.target.value)} style={input}>
          {DIVISIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <input value={season} onChange={(event) => setSeason(event.target.value)} style={input} />
        <button onClick={loadStandings} disabled={loading} style={button}>{loading ? "Loading..." : "Refresh"}</button>
      </div>

      <table style={table}><thead><tr>
        <th style={th}>Rank</th><th style={th}>Player</th><th style={th}>Played</th><th style={th}>Wins</th>
        <th style={th}>Draws</th><th style={th}>Losses</th><th style={th}>Points</th><th style={th}>Strokes</th>
      </tr></thead><tbody>
        {standings.map((row) => <tr key={row.player_id}>
          <td style={td}>{row.rank}</td><td style={tdStrong}>{row.player}</td><td style={td}>{row.played}</td>
          <td style={td}>{row.wins}</td><td style={td}>{row.draws}</td><td style={td}>{row.losses}</td>
          <td style={tdStrong}>{row.points}</td><td style={td}>{row.strokes}</td>
        </tr>)}
        {standings.length === 0 && <tr><td style={td} colSpan={8}>No saved standings found for this division and season.</td></tr>}
      </tbody></table>

      <section style={finalSection}>
        <h2 style={finalTitle}>Final Scorecard</h2>
        <p style={subtitle}>Generate a draft, review it, then explicitly approve it. Approval does not start promotion or relegation.</p>
        {scorecardLoading && <p>Loading Final Scorecard...</p>}
        {!scorecardLoading && seasonId && !scorecard && <p style={muted}>No Final Scorecard has been generated for this season.</p>}
        {scorecard && <>
          <div style={summary}><strong>{scorecard.status === "approved" ? "APPROVED / LOCKED HISTORY" : "DRAFT"}</strong>
            <span>Completed fixtures: {completedFixtures} / {totalFixtures}</span></div>
          {scorecard.status === "draft" && completedFixtures < totalFixtures &&
            <p style={warning}>Games remain incomplete. The draft may be regenerated, but the season cannot be finalized yet.</p>}
          <div style={tableWrap}><table style={table}><thead><tr>
            <th style={th}>Division</th><th style={th}>Rank</th><th style={th}>Player</th><th style={th}>Points</th>
            <th style={th}>Wins</th><th style={th}>Losses</th><th style={th}>Ties</th><th style={th}>Strokes</th><th style={th}>Completed Games</th>
          </tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}>
            <td style={td}>Stroke D{entry.division_number}</td><td style={td}>{entry.division_rank}</td>
            <td style={tdStrong}>{entry.player_screen_name}</td><td style={td}>{entry.points}</td><td style={td}>{entry.wins}</td>
            <td style={td}>{entry.losses}</td><td style={td}>{entry.ties}</td><td style={td}>{entry.strokes}</td><td style={td}>{entry.completed_game_count}</td>
          </tr>)}</tbody></table></div>
        </>}

        {scorecard?.status === "approved" && (
          <button
            onClick={() => router.push(`/admin/stroke/transition?scorecardId=${scorecard.id}`)}
            style={generateButton}
          >
            Build Next-Season Proposed Roster
          </button>
        )}

        {seasonId && scorecard?.status !== "approved" && <div style={actions}>
          <button onClick={generateFinalScorecard} disabled={generating || approving} style={generateButton}>
            {generating ? "Generating..." : scorecard ? "Regenerate Draft" : "Generate Final Scorecard"}
          </button>
          {scorecard?.status === "draft" && <>
            <input value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} placeholder="Optional approval note" style={input} />
            <button onClick={approveFinalScorecard} disabled={approving || generating || completedFixtures < totalFixtures} style={approveButton}>
              {approving ? "Approving..." : "Approve Final Scorecard"}
            </button>
          </>}
        </div>}
        {scorecardError && <p role="alert" style={errorText}>{scorecardError}</p>}
        {scorecardMessage && <p role="status" style={successText}>{scorecardMessage}</p>}
      </section>
    </div></main>
  )
}

const page: React.CSSProperties = { minHeight: "100vh", background: "black", color: "white", padding: 24 }
const container: React.CSSProperties = { maxWidth: 1100, margin: "0 auto" }
const topBar: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }
const title: React.CSSProperties = { fontSize: 38, marginTop: 24, marginBottom: 8 }
const subtitle: React.CSSProperties = { color: "#aaa", marginBottom: 20 }
const controls: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }
const input: React.CSSProperties = { background: "#111", color: "white", border: "1px solid #555", padding: 10, borderRadius: 8 }
const button: React.CSSProperties = { background: "#2563eb", border: "none", padding: "10px 16px", borderRadius: 8, color: "white", cursor: "pointer" }
const backButton: React.CSSProperties = { ...button, background: "#333" }
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", marginTop: 16 }
const tableWrap: React.CSSProperties = { overflowX: "auto" }
const th: React.CSSProperties = { textAlign: "left", padding: 10, borderBottom: "1px solid #555" }
const td: React.CSSProperties = { padding: 10, borderBottom: "1px solid #333" }
const tdStrong: React.CSSProperties = { ...td, fontWeight: 800 }
const finalSection: React.CSSProperties = { marginTop: 40, paddingTop: 28, borderTop: "1px solid #444" }
const finalTitle: React.CSSProperties = { fontSize: 30, marginBottom: 8 }
const summary: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", padding: 14, background: "#111", border: "1px solid #444", borderRadius: 10 }
const actions: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }
const generateButton: React.CSSProperties = { ...button, background: "#2563eb" }
const approveButton: React.CSSProperties = { ...button, background: "#16a34a" }
const muted: React.CSSProperties = { color: "#aaa" }
const warning: React.CSSProperties = { color: "#fbbf24" }
const errorText: React.CSSProperties = { color: "#fca5a5", whiteSpace: "pre-wrap" }
const successText: React.CSSProperties = { color: "#86efac", whiteSpace: "pre-wrap" }
