"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type SeasonRow = {
  id: string
  season_number: number
  is_active: boolean
  due_date: string | null
  end_date: string | null
}
type RosterRow = {
  id: string
  season_id: string
  division_count: number
  status: "draft" | "approved" | "locked"
}
type SeasonStandingRow = { player_id: string; points: number; wins: number; losses: number; ties: number; strokes: number; rank: number }
type Standing = { player: string; player_id: string; played: number; wins: number; draws: number; losses: number; points: number; holesWon: number; rank: number }
type ScorecardRow = { id: string; season_id: string; source_roster_version_id: string; status: "draft" | "approved" | "cancelled"; approved_at: string | null; approval_note: string | null }
type ScorecardEntryRow = { id: string; division_number: number; division_rank: number; player_id: string; player_screen_name: string; completed_game_count: number; wins: number; losses: number; ties: number; points: number; holes_won: number; game1_course: string | null; game1_outcome: string | null; game1_hw: number | null; game2_course: string | null; game2_outcome: string | null; game2_hw: number | null; game3_course: string | null; game3_outcome: string | null; game3_hw: number | null }

const divisionThemes: Record<number, { background: string; border: string; accent: string }> = {
  1: { background: "rgba(124, 45, 18, 0.18)", border: "#9a3412", accent: "#fb923c" },
  2: { background: "rgba(20, 83, 45, 0.18)", border: "#15803d", accent: "#4ade80" },
  3: { background: "rgba(30, 64, 175, 0.16)", border: "#1d4ed8", accent: "#60a5fa" },
  4: { background: "rgba(113, 63, 18, 0.18)", border: "#a16207", accent: "#facc15" },
  5: { background: "rgba(88, 28, 135, 0.18)", border: "#7e22ce", accent: "#c084fc" },
}

function formatDate(value: string | null) {
  if (!value) return "Not set"
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day))
}

export default function MatchStandingsPage() {
  const router = useRouter()
  const loadVersion = useRef(0)
  const [seasons, setSeasons] = useState<SeasonRow[]>([])
  const [rosters, setRosters] = useState<RosterRow[]>([])
  const [seasonId, setSeasonId] = useState("")
  const [divisionNumber, setDivisionNumber] = useState("1")
  const [standings, setStandings] = useState<Standing[]>([])
  const [loading, setLoading] = useState(true)
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
    async function loadManagedSeasons() {
      setLoading(true)
      setScorecardError("")
      const { data: seasonData, error: seasonError } = await supabase
        .from("seasons")
        .select("id, season_number, is_active, due_date, end_date")
        .eq("league_type", "match")
        .is("division", null)
        .order("is_active", { ascending: false })
        .order("season_number", { ascending: false })

      if (seasonError) {
        setScorecardError(`Could not load Match seasons: ${seasonError.message}`)
        setLoading(false)
        return
      }

      const candidateSeasons = (seasonData || []) as SeasonRow[]
      if (candidateSeasons.length === 0) {
        setLoading(false)
        return
      }

      const { data: rosterData, error: rosterError } = await supabase
        .from("match_roster_versions")
        .select("id, season_id, division_count, status")
        .in("season_id", candidateSeasons.map((item) => item.id))
        .in("status", ["draft", "approved", "locked"])

      if (rosterError) {
        setScorecardError(`Could not load managed Match rosters: ${rosterError.message}`)
        setLoading(false)
        return
      }

      const loadedRosters = (rosterData || []) as RosterRow[]
      const managedIds = new Set(loadedRosters.map((item) => item.season_id))
      const loadedSeasons = candidateSeasons.filter((item) => managedIds.has(item.id))
      const requestedSeasonId = new URLSearchParams(window.location.search)
        .get("seasonId")
        ?.trim()

      setSeasons(loadedSeasons)
      setRosters(loadedRosters)
      setSeasonId((current) => {
        if (loadedSeasons.some((item) => item.id === current)) return current
        if (loadedSeasons.some((item) => item.id === requestedSeasonId)) {
          return requestedSeasonId || ""
        }
        return loadedSeasons[0]?.id || ""
      })
      setLoading(false)
    }

    void loadManagedSeasons()
  }, [])

  const selectedSeason = useMemo(
    () => seasons.find((item) => item.id === seasonId) || null,
    [seasonId, seasons]
  )
  const selectedRoster = useMemo(() => {
    const versions = rosters.filter((item) => item.season_id === seasonId)
    return (
      versions.find((item) => item.status === "approved") ||
      versions.find((item) => item.status === "locked") ||
      versions.find((item) => item.status === "draft") ||
      null
    )
  }, [rosters, seasonId])
  const divisions = useMemo(
    () => Array.from({ length: selectedRoster?.division_count || 0 }, (_, index) => index + 1),
    [selectedRoster]
  )
  const entriesByDivision = useMemo(() => {
    const grouped = new Map<number, ScorecardEntryRow[]>()
    entries.forEach((entry) => {
      grouped.set(entry.division_number, [...(grouped.get(entry.division_number) || []), entry])
    })
    return Array.from(grouped.entries()).sort(([left], [right]) => left - right)
  }, [entries])
  const displayedDueDate = selectedSeason
    ? formatDate(selectedSeason.end_date || selectedSeason.due_date)
    : "Not set"

  useEffect(() => {
    if (!selectedSeason || !selectedRoster) return
    void refreshSelectedData(selectedSeason, Number(divisionNumber))
    // refreshSelectedData receives the complete selection and only writes loaded state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionNumber, selectedRoster, selectedSeason])

  async function refreshSelectedData(activeSeason: SeasonRow, activeDivision: number) {
    const requestId = ++loadVersion.current
    await Promise.all([
      loadStandings(activeSeason, activeDivision, requestId),
      loadFinalScorecard(activeSeason, requestId),
    ])
  }

  async function loadStandings(activeSeason: SeasonRow, activeDivision: number, requestId: number) {
    setLoading(true)
    if (selectedRoster?.status === "approved") {
      const { error: rebuildError } = await supabase.rpc("rebuild_match_standings", {
        p_season_id: activeSeason.id,
        p_division_number: activeDivision,
      })
      if (requestId !== loadVersion.current) return
      if (rebuildError) {
        setScorecardError(`Could not rebuild managed Match standings: ${rebuildError.message}`)
        setLoading(false)
        return
      }
    }
    const { data, error } = await supabase
      .from("season_standings")
      .select("player_id, points, wins, losses, ties, strokes, rank")
      .eq("league_type", "match")
      .eq("division", `Match D${activeDivision}`)
      .eq("season_number", activeSeason.season_number)
      .order("rank", { ascending: true })

    if (requestId !== loadVersion.current) return
    if (error) {
      setScorecardError(`Could not load standings: ${error.message}`)
      setLoading(false)
      return
    }

    const savedRows = (data || []) as SeasonStandingRow[]
    let playerMap = new Map<string, string>()
    if (selectedRoster) {
      const { data: slotData, error: slotError } = await supabase
        .from("match_division_roster_slots")
        .select("player_id, player_screen_name")
        .eq("roster_version_id", selectedRoster.id)
        .eq("division_number", activeDivision)
        .not("player_id", "is", null)
      if (requestId !== loadVersion.current) return
      if (slotError) {
        setScorecardError(`Could not load roster player snapshots: ${slotError.message}`)
        setLoading(false)
        return
      }
      playerMap = new Map((slotData || []).map((slot) => [String(slot.player_id), String(slot.player_screen_name)]))
    }

    setStandings(savedRows.map((row) => ({
      player: playerMap.get(row.player_id) || "Unknown Player",
      player_id: row.player_id,
      played: Number(row.wins || 0) + Number(row.losses || 0) + Number(row.ties || 0),
      wins: Number(row.wins || 0),
      draws: Number(row.ties || 0),
      losses: Number(row.losses || 0),
      points: Number(row.points || 0),
      holesWon: Number(row.strokes || 0),
      rank: Number(row.rank || 0),
    })))
    setLoading(false)
  }

  async function loadFinalScorecard(activeSeason: SeasonRow, requestId: number) {
    setScorecardLoading(true)
    setScorecardError("")
    const { data: scorecardData, error: scorecardLoadError } = await supabase
      .from("match_final_scorecards")
      .select("id, season_id, source_roster_version_id, status, approved_at, approval_note")
      .eq("season_id", activeSeason.id)
      .in("status", ["draft", "approved"])

    if (requestId !== loadVersion.current) return
    if (scorecardLoadError) {
      setScorecardError(`Could not load Final Scorecard: ${scorecardLoadError.message}`)
      setScorecardLoading(false)
      return
    }

    const scorecards = (scorecardData || []) as ScorecardRow[]
    const selected = scorecards.find((item) => item.status === "approved") || scorecards.find((item) => item.status === "draft") || null
    if (!selected) {
      setScorecard(null)
      setEntries([])
      setCompletedFixtures(0)
      setTotalFixtures(0)
      setScorecardLoading(false)
      return
    }

    const [entryResponse, fixtureResponse] = await Promise.all([
      supabase
        .from("match_final_scorecard_entries")
        .select("id, division_number, division_rank, player_id, player_screen_name, completed_game_count, wins, losses, ties, points, holes_won, game1_course, game1_outcome, game1_hw, game2_course, game2_outcome, game2_hw, game3_course, game3_outcome, game3_hw")
        .eq("scorecard_id", selected.id)
        .order("division_number", { ascending: true })
        .order("division_rank", { ascending: true }),
      supabase
        .from("schedule")
        .select("id")
        .eq("league_type", "match")
        .eq("season_id", activeSeason.id)
        .eq("match_roster_version_id", selected.source_roster_version_id),
    ])

    if (requestId !== loadVersion.current) return
    if (entryResponse.error || fixtureResponse.error) {
      setScorecardError(
        entryResponse.error
          ? `Could not load Final Scorecard entries: ${entryResponse.error.message}`
          : `Could not load fixture progress: ${fixtureResponse.error?.message}`
      )
      setScorecardLoading(false)
      return
    }

    const fixtureIds = (fixtureResponse.data || []).map((fixture) => fixture.id)
    let completedCount = 0
    if (fixtureIds.length > 0) {
      const { data: resultData, error: resultError } = await supabase
        .from("results")
        .select("schedule_id, player1_hw, player2_hw")
        .eq("league_type", "match")
        .in("schedule_id", fixtureIds)
      if (requestId !== loadVersion.current) return
      if (resultError) {
        setScorecardError(`Could not load result progress: ${resultError.message}`)
        setScorecardLoading(false)
        return
      }
      completedCount = (resultData || []).filter(
        (result) => result.player1_hw !== null && result.player2_hw !== null
      ).length
    }

    setScorecard(selected)
    setEntries((entryResponse.data || []) as ScorecardEntryRow[])
    setTotalFixtures(fixtureIds.length)
    setCompletedFixtures(completedCount)
    setApprovalNote(selected.approval_note || "")
    setScorecardLoading(false)
  }

  async function generateFinalScorecard() {
    if (!selectedSeason) return
    setGenerating(true)
    setScorecardError("")
    setScorecardMessage("")
    const { error } = await supabase.rpc("generate_match_final_scorecard", {
      p_season_id: selectedSeason.id,
    })
    if (error) {
      setScorecardError(`Final Scorecard generation failed: ${error.message}`)
      setGenerating(false)
      return
    }
    await refreshSelectedData(selectedSeason, Number(divisionNumber))
    setScorecardMessage("Draft Final Scorecard generated. Review it before approval.")
    setGenerating(false)
  }

  async function approveFinalScorecard() {
    if (!scorecard || scorecard.status !== "draft" || !selectedSeason) return
    if (!window.confirm("Approve and permanently freeze this Final Scorecard?")) return
    setApproving(true)
    setScorecardError("")
    setScorecardMessage("")
    const { error } = await supabase.rpc("approve_match_final_scorecard", {
      p_final_scorecard_id: scorecard.id,
      p_approval_note: approvalNote,
    })
    if (error) {
      setScorecardError(`Final Scorecard approval failed: ${error.message}`)
      setApproving(false)
      return
    }
    await refreshSelectedData(selectedSeason, Number(divisionNumber))
    setScorecardMessage("Final Scorecard approved and frozen. The source roster is now locked.")
    setApproving(false)
  }

  function selectSeason(nextSeasonId: string) {
    setSeasonId(nextSeasonId)
    setDivisionNumber("1")
    setScorecardMessage("")
    const params = new URLSearchParams(window.location.search)
    params.set("seasonId", nextSeasonId)
    window.history.replaceState(null, "", `?${params.toString()}`)
  }

  return (
    <main style={page}>
      <div style={container}>
        <div style={topBar}>
          <button onClick={() => router.push("/admin/match")} style={backButton}>← Back to Match</button>
          {seasonId && (
            <>
              <button
                onClick={() => router.push(`/admin/match/results?seasonId=${encodeURIComponent(seasonId)}`)}
                style={backButton}
              >
                Results Admin
              </button>
              <button
                onClick={() => router.push(`/admin/match/schedule?seasonId=${encodeURIComponent(seasonId)}`)}
                style={backButton}
              >
                Schedule &amp; Images
              </button>
            </>
          )}
        </div>
        <h1 style={title}>Match Standings</h1>
        <p style={subtitle}>Authoritative managed Match standings and Final Scorecard.</p>

        <div style={controls}>
          <select value={seasonId} onChange={(event) => selectSeason(event.target.value)} style={input}>
            {seasons.map((item) => (
              <option key={item.id} value={item.id}>Season {item.season_number}</option>
            ))}
          </select>
          <select value={divisionNumber} onChange={(event) => setDivisionNumber(event.target.value)} style={input}>
            {divisions.map((item) => (
              <option key={item} value={item}>Match D{item}</option>
            ))}
          </select>
          <button
            onClick={() => selectedSeason && void refreshSelectedData(selectedSeason, Number(divisionNumber))}
            disabled={loading || !selectedSeason}
            style={button}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        <div style={tableWrap}>
          <table style={table}>
            <thead><tr>
              <th style={th}>Rank</th><th style={th}>Player</th><th style={th}>Played</th><th style={th}>Wins</th>
              <th style={th}>Draws</th><th style={th}>Losses</th><th style={th}>Points</th><th style={th}>HW</th>
            </tr></thead>
            <tbody>
              {standings.map((row) => (
                <tr key={row.player_id}>
                  <td style={td}>{row.rank}</td><td style={tdStrong}>{row.player}</td><td style={td}>{row.played}</td>
                  <td style={td}>{row.wins}</td><td style={td}>{row.draws}</td><td style={td}>{row.losses}</td>
                  <td style={tdStrong}>{row.points}</td><td style={td}>{row.holesWon}</td>
                </tr>
              ))}
              {standings.length === 0 && <tr><td style={td} colSpan={8}>No saved standings found for this division and season.</td></tr>}
            </tbody>
          </table>
        </div>

        <section style={finalSection}>
          <div style={finalHeader}>
            <div>
              <h2 style={finalTitle}>Final Scorecard</h2>
              <p style={subtitle}>Generate a draft, review it, then explicitly approve it.</p>
            </div>
            {selectedSeason && (
              <div style={dueDateCard}>
                <span style={dueLabel}>SEASON DUE DATE</span>
                <strong style={dueValue}>{displayedDueDate}</strong>
              </div>
            )}
          </div>

          {scorecardLoading && <p>Loading Final Scorecard...</p>}
          {!scorecardLoading && selectedSeason && !scorecard && <p style={muted}>No Final Scorecard has been generated for this season.</p>}
          {scorecard && (
            <>
              <div style={summary}>
                <strong>{scorecard.status === "approved" ? "APPROVED / LOCKED HISTORY" : "DRAFT"}</strong>
                <span>Completed fixtures: {completedFixtures} / {totalFixtures}</span>
              </div>
              {scorecard.status === "draft" && completedFixtures < totalFixtures && (
                <p style={warning}>Games remain incomplete. The draft may be regenerated, but the season cannot be finalized yet.</p>
              )}

              {entriesByDivision.map(([division, divisionEntries]) => {
                const theme = divisionThemes[division]
                return (
                  <section
                    key={division}
                    style={{
                      ...divisionCard,
                      background: theme?.background || "#0b0b0b",
                      borderColor: theme?.border || "#444",
                    }}
                  >
                    <div style={divisionCardHeader}>
                      <h3 style={{ ...divisionTitle, color: theme?.accent || "#ddd" }}>Match D{division}</h3>
                      <strong style={divisionDueDate}>Due {displayedDueDate}</strong>
                    </div>
                    <div style={tableWrap}>
                      <table style={table}>
                        <thead><tr>
                          <th style={th}>Rank</th><th style={th}>Player</th><th style={th}>Played</th><th style={th}>Points</th>
                          <th style={th}>Wins</th><th style={th}>Losses</th><th style={th}>Ties</th>
                          <th style={th}>Holes Won</th><th style={th}>Completed Games</th>
                        </tr></thead>
                        <tbody>
                          {divisionEntries.map((entry) => (
                            <tr key={entry.id}>
                              <td style={td}>#{entry.division_rank}</td>
                              <td style={playerNameCell}>{entry.player_screen_name}</td>
                              <td style={td}>{entry.completed_game_count}</td>
                              <td style={metricCell}>{entry.points}</td>
                              <td style={td}>{entry.wins}</td><td style={td}>{entry.losses}</td><td style={td}>{entry.ties}</td>
                              <td style={metricCell}>{entry.holes_won}</td>
                              <td style={td}>{entry.completed_game_count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )
              })}
            </>
          )}

          {scorecard?.status === "approved" && (
            <button
              onClick={() => router.push(`/admin/match/transition?scorecardId=${encodeURIComponent(scorecard.id)}`)}
              style={generateButton}
            >
              Build Next-Season Proposed Roster
            </button>
          )}

          {selectedSeason && scorecard?.status !== "approved" && (
            <div style={actions}>
              <button onClick={generateFinalScorecard} disabled={generating || approving} style={generateButton}>
                {generating ? "Generating..." : scorecard ? "Regenerate Draft" : "Generate Final Scorecard"}
              </button>
              {scorecard?.status === "draft" && (
                <>
                  <input value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} placeholder="Optional approval note" style={input} />
                  <button onClick={approveFinalScorecard} disabled={approving || generating || completedFixtures < totalFixtures} style={approveButton}>
                    {approving ? "Approving..." : "Approve Final Scorecard"}
                  </button>
                </>
              )}
            </div>
          )}
          {scorecardError && <p role="alert" style={errorText}>{scorecardError}</p>}
          {scorecardMessage && <p role="status" style={successText}>{scorecardMessage}</p>}
        </section>
      </div>
    </main>
  )
}

const page: React.CSSProperties = { minHeight: "100vh", background: "black", color: "white", padding: 24 }
const container: React.CSSProperties = { maxWidth: 1180, margin: "0 auto" }
const topBar: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }
const title: React.CSSProperties = { fontSize: 38, marginTop: 24, marginBottom: 8 }
const subtitle: React.CSSProperties = { color: "#aaa", marginBottom: 20 }
const controls: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }
const input: React.CSSProperties = { background: "#111", color: "white", border: "1px solid #555", padding: 10, borderRadius: 8 }
const button: React.CSSProperties = { background: "#2563eb", border: "none", padding: "10px 16px", borderRadius: 8, color: "white", cursor: "pointer" }
const backButton: React.CSSProperties = { ...button, background: "#333" }
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", marginTop: 10 }
const tableWrap: React.CSSProperties = { overflowX: "auto" }
const th: React.CSSProperties = { textAlign: "left", padding: 10, borderBottom: "1px solid #555", color: "#cbd5e1", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.4 }
const td: React.CSSProperties = { padding: 10, borderBottom: "1px solid rgba(255,255,255,0.11)" }
const tdStrong: React.CSSProperties = { ...td, fontWeight: 800 }
const metricCell: React.CSSProperties = { ...td, fontWeight: 800, color: "#f8fafc" }
const finalSection: React.CSSProperties = { marginTop: 40, paddingTop: 28, borderTop: "1px solid #444" }
const finalHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, flexWrap: "wrap" }
const finalTitle: React.CSSProperties = { fontSize: 30, marginBottom: 8 }
const dueDateCard: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5, padding: "12px 16px", background: "#111", border: "1px solid #555", borderRadius: 10 }
const dueLabel: React.CSSProperties = { color: "#94a3b8", fontSize: 12, fontWeight: 800, letterSpacing: 0.8 }
const dueValue: React.CSSProperties = { color: "#f8fafc", fontSize: 18 }
const summary: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", padding: 14, background: "#111", border: "1px solid #444", borderRadius: 10 }
const divisionCard: React.CSSProperties = { marginTop: 20, padding: 18, border: "1px solid #444", borderRadius: 14 }
const divisionCardHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }
const divisionTitle: React.CSSProperties = { margin: 0, fontSize: 24 }
const divisionDueDate: React.CSSProperties = { color: "#f8fafc", fontSize: 15, fontWeight: 700 }
const playerNameCell: React.CSSProperties = { ...td, fontSize: 16, fontWeight: 700, color: "#f8fafc" }
const actions: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }
const generateButton: React.CSSProperties = { ...button, marginTop: 20, background: "#2563eb" }
const approveButton: React.CSSProperties = { ...button, background: "#16a34a" }
const muted: React.CSSProperties = { color: "#aaa" }
const warning: React.CSSProperties = { color: "#fbbf24" }
const errorText: React.CSSProperties = { color: "#fca5a5", whiteSpace: "pre-wrap" }
const successText: React.CSSProperties = { color: "#86efac", whiteSpace: "pre-wrap" }
