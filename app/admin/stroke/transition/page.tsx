"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { logActivity } from "@/lib/activityLog"

type Entry = { player_id: string; player_screen_name: string; division_number: number; division_rank: number; completed_game_count: number }
type Decision = { player_id: string; decision: "returning" | "not_returning" }
type Season = { id: string; season_number: number }
type Player = { id: string; screen_name: string }
type ProposalSlot = { roster_version_id: string; target_season_id: string; target_division_count: number; division_number: number; slot_number: number; player_id: string | null; player_screen_name: string | null; movement_reason: string | null }

export default function StrokeTransitionPage() {
  const router = useRouter()
  const [scorecardId, setScorecardId] = useState("")
  const [sourceSeasonId, setSourceSeasonId] = useState("")
  const [sourceSeasonNumber, setSourceSeasonNumber] = useState<number | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [decisions, setDecisions] = useState<Map<string, Decision["decision"]>>(new Map())
  const [targetSeasons, setTargetSeasons] = useState<Season[]>([])
  const [targetSeasonId, setTargetSeasonId] = useState("")
  const [divisionCount, setDivisionCount] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [game1Course, setGame1Course] = useState("")
  const [game2Course, setGame2Course] = useState("")
  const [game3Course, setGame3Course] = useState("")
  const [players, setPlayers] = useState<Player[]>([])
  const [newPlayerId, setNewPlayerId] = useState("")
  const [newPlayerIds, setNewPlayerIds] = useState<string[]>([])
  const [proposal, setProposal] = useState<ProposalSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [savingDecision, setSavingDecision] = useState("")
  const [generating, setGenerating] = useState(false)
  const [creatingSeason, setCreatingSeason] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  // The initial approved-scorecard context is intentionally loaded once.
  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => { void loadTransition() }, [])

  async function loadTransition() {
    const requestedId = new URLSearchParams(window.location.search).get("scorecardId")?.trim() || ""
    if (!requestedId) { setError("An approved Final Scorecard ID is required."); setLoading(false); return }
    setScorecardId(requestedId)
    const { data: scorecard, error: scorecardError } = await supabase.from("stroke_final_scorecards")
      .select("id, season_id, status").eq("id", requestedId).maybeSingle()
    if (scorecardError || !scorecard || scorecard.status !== "approved") {
      setError(scorecardError?.message || "An approved Final Scorecard is required."); setLoading(false); return
    }
    setSourceSeasonId(scorecard.season_id)
    const { data: sourceSeason, error: sourceError } = await supabase.from("seasons")
      .select("season_number").eq("id", scorecard.season_id).maybeSingle()
    if (sourceError || !sourceSeason) { setError(sourceError?.message || "Source season not found."); setLoading(false); return }
    setSourceSeasonNumber(sourceSeason.season_number)

    const [entryResponse, decisionResponse, seasonResponse, playerResponse] = await Promise.all([
      supabase.from("stroke_final_scorecard_entries")
        .select("player_id, player_screen_name, division_number, division_rank, completed_game_count")
        .eq("scorecard_id", requestedId).order("division_number").order("division_rank"),
      supabase.from("stroke_final_scorecard_player_decisions").select("player_id, decision").eq("final_scorecard_id", requestedId),
      supabase.from("seasons").select("id, season_number").eq("league_type", "stroke")
        .is("division", null).eq("season_number", sourceSeason.season_number + 1),
      supabase.from("players").select("id, screen_name").eq("active", true).order("screen_name"),
    ])
    const loadError = entryResponse.error || decisionResponse.error || seasonResponse.error || playerResponse.error
    if (loadError) { setError(loadError.message); setLoading(false); return }
    const loadedEntries = (entryResponse.data || []) as Entry[]
    const candidateSeasons = (seasonResponse.data || []) as Season[]
    let loadedSeasons: Season[] = []
    if (candidateSeasons.length > 0) {
      const { data: rosterData, error: rosterError } = await supabase
        .from("stroke_roster_versions")
        .select("season_id")
        .in("season_id", candidateSeasons.map((season) => season.id))
        .in("status", ["draft", "approved"])
      if (rosterError) { setError(rosterError.message); setLoading(false); return }
      const managedIds = new Set((rosterData || []).map((roster) => roster.season_id as string))
      loadedSeasons = candidateSeasons.filter((season) => managedIds.has(season.id))
    }
    setEntries(loadedEntries)
    setDecisions(new Map(((decisionResponse.data || []) as Decision[]).map((item) => [item.player_id, item.decision])))
    setTargetSeasons(loadedSeasons); setTargetSeasonId(loadedSeasons[0]?.id || "")
    setDivisionCount(String(Math.max(1, ...loadedEntries.map((entry) => entry.division_number))))
    setPlayers((playerResponse.data || []) as Player[]); setLoading(false)
  }

  async function setDecision(playerId: string, decision: Decision["decision"]) {
    setSavingDecision(playerId); setError(""); setMessage("")
    const { error: saveError } = await supabase.rpc("set_stroke_return_decision", {
      p_final_scorecard_id: scorecardId, p_player_id: playerId, p_decision: decision,
    })
    if (saveError) { setError(saveError.message); setSavingDecision(""); return }
    setDecisions((current) => new Map(current).set(playerId, decision)); setSavingDecision("")
  }

  function addNewPlayer() {
    if (!newPlayerId || newPlayerIds.includes(newPlayerId)) return
    setNewPlayerIds((current) => [...current, newPlayerId]); setNewPlayerId("")
  }

  function moveNewPlayer(index: number, direction: -1 | 1) {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= newPlayerIds.length) return
    setNewPlayerIds((current) => {
      const next = [...current]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]; return next
    })
  }

  async function createNextSeason() {
    const seasonNumber = sourceSeasonNumber === null ? 0 : sourceSeasonNumber + 1
    const parsedCount = Number(divisionCount)
    if (!Number.isInteger(seasonNumber) || seasonNumber <= 0) { setError("The next Stroke season number could not be determined."); return }
    if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 20) { setError("Number of divisions must be between 1 and 20."); return }
    if (!startDate) { setError("Choose a start date."); return }
    if (!endDate) { setError("Choose an end date."); return }
    if (endDate < startDate) { setError("End date cannot be before the start date."); return }
    if (!game1Course.trim()) { setError("Enter the Game 1 course."); return }
    if (!game2Course.trim()) { setError("Enter the Game 2 course."); return }
    if (!game3Course.trim()) { setError("Enter the Game 3 course."); return }

    setCreatingSeason(true); setError(""); setMessage("")
    const { data, error: createError } = await supabase.rpc("create_stroke_season_with_roster", {
      p_season_number: seasonNumber,
      p_division_count: parsedCount,
      p_start_date: startDate,
      p_due_date: endDate,
      p_end_date: endDate,
      p_game1_course: game1Course.trim(),
      p_game2_course: game2Course.trim(),
      p_game3_course: game3Course.trim(),
    }).single()

    if (createError || !data) {
      const errorMessage = createError?.message || "No season data was returned."
      await logActivity({ userType: "admin", action: "Create Stroke Season From Transition Failed", status: "error", leagueType: "stroke", page: "/admin/stroke/transition", details: { sourceSeasonId, seasonNumber, divisionCount: parsedCount, error: errorMessage } })
      setError(`Stroke season was not created: ${errorMessage}`); setCreatingSeason(false); return
    }

    const created = data as { season_id: string; season_number: number; division_count: number }
    const createdSeason = { id: created.season_id, season_number: created.season_number }
    setTargetSeasons((current) => [...current.filter((season) => season.id !== createdSeason.id), createdSeason])
    setTargetSeasonId(created.season_id)
    setDivisionCount(String(created.division_count))
    await logActivity({ userType: "admin", action: "Created Stroke Season From Transition", status: "success", leagueType: "stroke", page: "/admin/stroke/transition", details: { sourceSeasonId, targetSeasonId: created.season_id, seasonNumber: created.season_number, divisionCount: created.division_count } })
    setMessage(`Stroke Season ${created.season_number} created and selected as the target season. Return decisions and new-player order were preserved.`)
    setCreatingSeason(false)
  }

  async function generateProposal() {
    const parsedCount = Number(divisionCount)
    if (!targetSeasonId || !Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 20) {
      setError("Choose the target season and a division count from 1 through 20."); return
    }
    setGenerating(true); setError(""); setMessage("")
    const { data, error: generateError } = await supabase.rpc("generate_stroke_next_season_proposal", {
      p_final_scorecard_id: scorecardId, p_target_season_id: targetSeasonId,
      p_target_division_count: parsedCount, p_new_player_ids: newPlayerIds,
    })
    if (generateError) { setError(generateError.message); setGenerating(false); return }
    setProposal((data || []) as ProposalSlot[]); setMessage("Draft next-season roster generated. It is not official until separately approved.")
    setGenerating(false)
  }

  const entryIds = useMemo(() => new Set(entries.map((entry) => entry.player_id)), [entries])
  const availableNewPlayers = players.filter((player) => !entryIds.has(player.id) && !newPlayerIds.includes(player.id))
  const playerNames = useMemo(() => new Map(players.map((player) => [player.id, player.screen_name])), [players])
  const divisions = Array.from(new Set(proposal.map((slot) => slot.division_number))).sort((a, b) => a - b)

  if (loading) return <main style={page}><p>Loading Stroke transition...</p></main>
  return <main style={page}><div style={container}>
    <button onClick={() => router.push("/admin/stroke/standings")} style={secondaryButton}>← Stroke Standings</button>
    <h1>Next-Season Stroke Transition</h1>
    <p style={warning}>This workflow creates a DRAFT roster. Nothing is official until the separate roster approval.</p>

    <section style={panel}><h2>Returning Decisions</h2>
      {entries.map((entry) => <div key={entry.player_id} style={decisionRow}>
        <span>Stroke D{entry.division_number} #{entry.division_rank} — {entry.player_screen_name} ({entry.completed_game_count} games)</span>
        <div style={actions}>
          <button disabled={savingDecision === entry.player_id} onClick={() => setDecision(entry.player_id, "returning")}
            style={decisions.get(entry.player_id) === "returning" ? activeButton : secondaryButton}>Returning</button>
          <button disabled={savingDecision === entry.player_id} onClick={() => setDecision(entry.player_id, "not_returning")}
            style={decisions.get(entry.player_id) === "not_returning" ? dangerButton : secondaryButton}>Not Returning</button>
        </div>
      </div>)}
    </section>

    <section style={panel}><h2>Create Next Stroke Season</h2>
      <p>The normal path is to create and select the next managed Stroke season here.</p>
      <div style={formRow}>
        <label style={fieldLabel}>Season Number<input value={sourceSeasonNumber === null ? "" : String(sourceSeasonNumber + 1)} readOnly style={input} /></label>
        <label style={fieldLabel}>Number of Divisions<input type="number" min="1" max="20" value={divisionCount} onChange={(event) => setDivisionCount(event.target.value)} style={input} /></label>
        <label style={fieldLabel}>Start Date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} style={input} /></label>
        <label style={fieldLabel}>End Date<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} style={input} /></label>
        <label style={fieldLabel}>Game 1 Course<input value={game1Course} onChange={(event) => setGame1Course(event.target.value)} style={input} /></label>
        <label style={fieldLabel}>Game 2 Course<input value={game2Course} onChange={(event) => setGame2Course(event.target.value)} style={input} /></label>
        <label style={fieldLabel}>Game 3 Course<input value={game3Course} onChange={(event) => setGame3Course(event.target.value)} style={input} /></label>
      </div>
      <button onClick={() => void createNextSeason()} disabled={creatingSeason} style={primaryButton}>{creatingSeason ? "Creating Next Stroke Season..." : "Create Next Stroke Season"}</button>
    </section>

    <section style={panel}><h2>Target Season and New Players</h2>
      <p>Select the season created above, or use an existing eligible managed Stroke season.</p>
      <div style={formRow}><select value={targetSeasonId} onChange={(event) => setTargetSeasonId(event.target.value)} style={input}>
        <option value="">Select target season</option>{targetSeasons.map((item) => <option key={item.id} value={item.id}>Season {item.season_number}</option>)}
      </select><input type="number" min="1" max="20" value={divisionCount} onChange={(event) => setDivisionCount(event.target.value)} style={input} /></div>
      <div style={formRow}><select value={newPlayerId} onChange={(event) => setNewPlayerId(event.target.value)} style={input}>
        <option value="">Select new player</option>{availableNewPlayers.map((player) => <option key={player.id} value={player.id}>{player.screen_name}</option>)}
      </select><button onClick={addNewPlayer} style={primaryButton}>Add Player</button></div>
      {newPlayerIds.map((id, index) => <div key={id} style={decisionRow}><span>{index + 1}. {playerNames.get(id) || id}</span><div style={actions}>
        <button onClick={() => moveNewPlayer(index, -1)} style={secondaryButton}>↑</button>
        <button onClick={() => moveNewPlayer(index, 1)} style={secondaryButton}>↓</button>
        <button onClick={() => setNewPlayerIds((current) => current.filter((item) => item !== id))} style={dangerButton}>Remove</button>
      </div></div>)}
      <button onClick={generateProposal} disabled={generating} style={primaryButton}>{generating ? "Generating..." : proposal.length ? "Regenerate Proposed Roster" : "Generate Proposed Roster"}</button>
    </section>

    {proposal.length > 0 && <section style={panel}><h2>Proposed Roster — DRAFT / NOT OFFICIAL</h2>
      {divisions.map((division) => <div key={division}><h3>Stroke D{division}</h3>
        {proposal.filter((slot) => slot.division_number === division).map((slot) => <div key={slot.slot_number} style={slotRow}>
          <span>Slot {slot.slot_number}: {slot.player_screen_name || "EMPTY"}</span><span>{slot.movement_reason || ""}</span>
        </div>)}
      </div>)}
      <button onClick={() => router.push(`/admin/stroke/setup?seasonId=${targetSeasonId}&division=1`)} style={primaryButton}>Continue to Draft Roster Setup</button>
    </section>}
    {error && <p role="alert" style={errorText}>{error}</p>}{message && <p role="status" style={successText}>{message}</p>}
  </div></main>
}

const page: React.CSSProperties = { minHeight: "100vh", background: "black", color: "white", padding: 24 }
const container: React.CSSProperties = { maxWidth: 1100, margin: "0 auto" }
const panel: React.CSSProperties = { border: "1px solid #333", background: "#111", borderRadius: 14, padding: 20, marginTop: 20 }
const decisionRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #333", flexWrap: "wrap" }
const slotRow: React.CSSProperties = { ...decisionRow, color: "#ddd" }
const actions: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" }
const formRow: React.CSSProperties = { display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }
const input: React.CSSProperties = { minWidth: 220, padding: 10, background: "#050505", color: "white", border: "1px solid #555", borderRadius: 8 }
const fieldLabel: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 7, color: "#ddd", fontWeight: 700 }
const primaryButton: React.CSSProperties = { padding: "10px 15px", background: "#2563eb", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }
const secondaryButton: React.CSSProperties = { ...primaryButton, background: "#333" }
const activeButton: React.CSSProperties = { ...primaryButton, background: "#16a34a" }
const dangerButton: React.CSSProperties = { ...primaryButton, background: "#dc2626" }
const warning: React.CSSProperties = { color: "#fbbf24" }
const errorText: React.CSSProperties = { color: "#fca5a5", whiteSpace: "pre-wrap" }
const successText: React.CSSProperties = { color: "#86efac", whiteSpace: "pre-wrap" }
