"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type SeasonRow = {
  id: string
  season_number: number
}

type ScheduleMatch = {
  id: string
  season_id: string
  division_number: number
  division: string
  game_number: number
  game: string
  course: string | null
  player1: string
  player2: string
  player1_name: string | null
  player2_name: string | null
  player1_id: string
  player2_id: string
}

type ResultRow = {
  schedule_id: string
  player1_score: number
  player2_score: number
}

export default function StrokeResultsPage() {
  const router = useRouter()
  const [seasons, setSeasons] = useState<SeasonRow[]>([])
  const [seasonId, setSeasonId] = useState("")
  const [divisionNumber, setDivisionNumber] = useState("")
  const [scheduledMatches, setScheduledMatches] = useState<ScheduleMatch[]>([])
  const [resultsBySchedule, setResultsBySchedule] = useState<Map<string, ResultRow>>(new Map())
  const [selectedScheduleId, setSelectedScheduleId] = useState("")
  const [score1, setScore1] = useState("")
  const [score2, setScore2] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => {
    void loadSeasons()
  }, [])

  useEffect(() => {
    if (seasonId) void loadFixtures(seasonId)
  }, [seasonId])

  async function loadSeasons() {
    setLoading(true)
    setError("")

    const { data, error: seasonError } = await supabase
      .from("seasons")
      .select("id, season_number")
      .eq("league_type", "stroke")
      .order("season_number", { ascending: false })

    if (seasonError) {
      setError(`Could not load Stroke seasons: ${seasonError.message}`)
      setLoading(false)
      return
    }

    const loadedSeasons = (data || []) as SeasonRow[]
    setSeasons(loadedSeasons)
    setSeasonId((current) => current || loadedSeasons[0]?.id || "")
    setLoading(false)
  }

  async function loadFixtures(selectedSeasonId: string) {
    setLoading(true)
    setError("")

    const { data, error: fixtureError } = await supabase
      .from("schedule")
      .select("id, season_id, division_number, division, game_number, game, course, player1, player2, player1_name, player2_name, player1_id, player2_id")
      .eq("league_type", "stroke")
      .eq("season_id", selectedSeasonId)
      .not("roster_version_id", "is", null)
      .not("division_number", "is", null)
      .not("game_number", "is", null)
      .not("player1_id", "is", null)
      .not("player2_id", "is", null)
      .order("division_number", { ascending: true })
      .order("game_number", { ascending: true })
      .order("id", { ascending: true })

    if (fixtureError) {
      setError(`Could not load managed Stroke fixtures: ${fixtureError.message}`)
      setLoading(false)
      return
    }

    const fixtures = (data || []) as ScheduleMatch[]
    const fixtureIds = fixtures.map((fixture) => fixture.id)
    let resultRows: ResultRow[] = []

    if (fixtureIds.length > 0) {
      const { data: resultData, error: resultError } = await supabase
        .from("results")
        .select("schedule_id, player1_score, player2_score")
        .eq("league_type", "stroke")
        .in("schedule_id", fixtureIds)

      if (resultError) {
        setError(`Could not load Stroke results: ${resultError.message}`)
        setLoading(false)
        return
      }

      resultRows = (resultData || []) as ResultRow[]
    }

    const availableDivisions = Array.from(
      new Set(fixtures.map((fixture) => fixture.division_number))
    ).sort((a, b) => a - b)

    setScheduledMatches(fixtures)
    setResultsBySchedule(new Map(resultRows.map((result) => [result.schedule_id, result])))
    setDivisionNumber((current) =>
      availableDivisions.includes(Number(current))
        ? current
        : availableDivisions[0]?.toString() || ""
    )
    resetPickedMatch()
    setLoading(false)
  }

  function resetPickedMatch() {
    setSelectedScheduleId("")
    setScore1("")
    setScore2("")
  }

  function handlePickMatch(scheduleId: string) {
    setSelectedScheduleId(scheduleId)
    setError("")
    setMessage("")

    const existingResult = resultsBySchedule.get(scheduleId)
    setScore1(existingResult ? String(existingResult.player1_score) : "")
    setScore2(existingResult ? String(existingResult.player2_score) : "")
  }

  function parseScore(value: string, label: string) {
    if (value.trim() === "") throw new Error(`${label} is required.`)
    if (!/^-?\d+$/.test(value.trim())) {
      throw new Error(`${label} must be a whole number.`)
    }

    const parsed = Number(value.trim())
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(`${label} must be a valid whole number.`)
    }
    return parsed
  }

  async function handleSubmit() {
    if (!selectedMatch) {
      setError("Select a managed Stroke fixture before saving a result.")
      return
    }

    let player1Score: number
    let player2Score: number

    try {
      player1Score = parseScore(score1, `${player1Name} score`)
      player2Score = parseScore(score2, `${player2Name} score`)
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Enter valid scores.")
      return
    }

    setSaving(true)
    setError("")
    setMessage("")

    const { error: saveError } = await supabase.rpc("save_stroke_result", {
      p_schedule_id: selectedMatch.id,
      p_player1_score: player1Score,
      p_player2_score: player2Score,
    })

    if (saveError) {
      setError(`Result save failed: ${saveError.message}`)
      setSaving(false)
      return
    }

    try {
      const { error: standingsError } = await supabase.rpc("rebuild_stroke_standings", {
        p_season_id: selectedMatch.season_id,
        p_division_number: selectedMatch.division_number,
      })

      if (standingsError) throw standingsError

      await loadFixtures(selectedMatch.season_id)
      setMessage("Stroke result saved. Standings were recalculated.")
    } catch (standingsError) {
      await loadFixtures(selectedMatch.season_id)
      setError(
        `Stroke result saved, but standings refresh failed: ${
          standingsError instanceof Error
            ? standingsError.message
            : typeof standingsError === "object" && standingsError && "message" in standingsError
              ? String(standingsError.message)
              : "Unknown error."
        }`
      )
    } finally {
      setSaving(false)
    }
  }

  const selectedSeason = seasons.find((season) => season.id === seasonId) || null
  const divisions = useMemo(
    () => Array.from(new Set(scheduledMatches.map((fixture) => fixture.division_number))).sort((a, b) => a - b),
    [scheduledMatches]
  )
  const visibleMatches = useMemo(
    () => scheduledMatches.filter((fixture) => fixture.division_number === Number(divisionNumber)),
    [divisionNumber, scheduledMatches]
  )
  const selectedMatch = scheduledMatches.find((fixture) => fixture.id === selectedScheduleId) || null
  const player1Name = selectedMatch?.player1_name || selectedMatch?.player1 || "Player 1"
  const player2Name = selectedMatch?.player2_name || selectedMatch?.player2 || "Player 2"
  const correctingResult = Boolean(selectedMatch && resultsBySchedule.has(selectedMatch.id))

  return (
    <main style={page}>
      <div style={container}>
        <div style={topBar}>
          <button onClick={() => router.push("/admin/stroke")} style={backButtonPrimary}>
            ← Stroke Hub
          </button>
          <button onClick={() => router.push("/admin")} style={backButtonSecondary}>
            ← Admin
          </button>
        </div>

        <div style={card}>
          <h1 style={title}>Stroke Results Admin</h1>
          <p style={subtitle}>Pick a managed fixture, enter both scores, and save.</p>

          <section style={section}>
            <h2 style={sectionTitle}>League Info</h2>
            <div style={grid}>
              <div>
                <label style={label}>Season</label>
                <select value={seasonId} onChange={(event) => setSeasonId(event.target.value)} style={input}>
                  {seasons.map((season) => (
                    <option key={season.id} value={season.id}>Season {season.season_number}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label}>Division</label>
                <select value={divisionNumber} onChange={(event) => { setDivisionNumber(event.target.value); resetPickedMatch() }} style={input}>
                  {divisions.map((division) => (
                    <option key={division} value={division}>Stroke D{division}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section style={section}>
            <h2 style={sectionTitle}>Match</h2>
            <label style={label}>Pick Match</label>
            <select value={selectedScheduleId} onChange={(event) => handlePickMatch(event.target.value)} style={wideInput}>
              <option value="">Select match</option>
              {visibleMatches.map((match) => {
                const completed = resultsBySchedule.has(match.id)
                return (
                  <option key={match.id} value={match.id}>
                    {match.player1_name || match.player1} vs {match.player2_name || match.player2}{completed ? " — Result entered" : ""}
                  </option>
                )
              })}
            </select>

            {selectedMatch && (
              <div style={matchCard}>
                <div style={matchText}>{player1Name}</div>
                <div style={vsText}>vs</div>
                <div style={matchText}>{player2Name}</div>
                <div style={courseText}>Division: {selectedMatch.division}</div>
                <div style={courseText}>Game: {selectedMatch.game}</div>
                <div style={courseText}>Course: {selectedMatch.course || "Not set"}</div>
              </div>
            )}
          </section>

          <section style={section}>
            <h2 style={sectionTitle}>Scores</h2>
            <div style={grid}>
              <div>
                <label style={label}>{player1Name} Score</label>
                <input value={score1} onChange={(event) => setScore1(event.target.value)} placeholder="-28" inputMode="numeric" style={input} />
              </div>
              <div>
                <label style={label}>{player2Name} Score</label>
                <input value={score2} onChange={(event) => setScore2(event.target.value)} placeholder="-25" inputMode="numeric" style={input} />
              </div>
            </div>
          </section>

          <button onClick={handleSubmit} disabled={saving || loading || !selectedMatch} style={submitButton}>
            {saving ? "Saving..." : correctingResult ? "Save Score Correction" : "Submit Result"}
          </button>

          {loading && <p style={infoText}>Loading managed Stroke fixtures...</p>}
          {error && <p role="alert" style={errorText}>{error}</p>}
          {message && <p role="status" style={successText}>{message}</p>}
        </div>
      </div>
    </main>
  )
}

const page: React.CSSProperties = { minHeight: "100vh", background: "black", color: "white", display: "flex", justifyContent: "center" }
const container: React.CSSProperties = { width: "100%", maxWidth: 1100, padding: 30 }
const topBar: React.CSSProperties = { display: "flex", gap: 10, marginBottom: 20 }
const backButtonPrimary: React.CSSProperties = { padding: "10px 16px", background: "#2563eb", border: "none", borderRadius: 8, color: "white", fontWeight: 700, cursor: "pointer" }
const backButtonSecondary: React.CSSProperties = { padding: "10px 16px", background: "#222", border: "1px solid #555", borderRadius: 8, color: "white", cursor: "pointer" }
const card: React.CSSProperties = { background: "#050505", border: "1px solid #333", borderRadius: 18, padding: 28, boxShadow: "0 0 30px rgba(255,255,255,0.08)" }
const title: React.CSSProperties = { fontSize: 38, margin: 0 }
const subtitle: React.CSSProperties = { marginTop: 8, color: "#aaa", fontSize: 16 }
const section: React.CSSProperties = { marginTop: 28 }
const sectionTitle: React.CSSProperties = { fontSize: 24, marginBottom: 14 }
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 18 }
const label: React.CSSProperties = { display: "block", marginBottom: 8, color: "#ddd", fontWeight: 700 }
const input: React.CSSProperties = { width: "100%", padding: 14, background: "#111", color: "white", border: "1px solid #555", borderRadius: 10, fontSize: 18 }
const wideInput: React.CSSProperties = { ...input, fontSize: 20 }
const matchCard: React.CSSProperties = { marginTop: 18, padding: 22, background: "#111", border: "1px solid #444", borderRadius: 14, textAlign: "center" }
const matchText: React.CSSProperties = { fontSize: 28, fontWeight: 800 }
const vsText: React.CSSProperties = { margin: "8px 0", color: "#aaa", fontSize: 18 }
const courseText: React.CSSProperties = { marginTop: 8, color: "#ccc", fontSize: 18 }
const submitButton: React.CSSProperties = { marginTop: 30, padding: 16, width: "100%", background: "#16a34a", border: "none", borderRadius: 12, color: "white", fontSize: 20, fontWeight: 800, cursor: "pointer" }
const infoText: React.CSSProperties = { marginTop: 16, color: "#bbb" }
const errorText: React.CSSProperties = { marginTop: 16, color: "#fca5a5", whiteSpace: "pre-wrap" }
const successText: React.CSSProperties = { marginTop: 16, color: "#86efac", whiteSpace: "pre-wrap" }
