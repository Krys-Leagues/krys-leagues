"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Fixture = { id: string; division_number: number; game_number: number; pyp_home_player_screen_name: string; pyp_away_player_screen_name: string }
type Difficulty = "Easy" | "Hard" | ""
type Result = { id: string; schedule_id: string; course1_name: string; course1_difficulty: Difficulty; course1_home_hw: number; course1_away_hw: number; course2_name: string; course2_difficulty: Difficulty; course2_home_hw: number; course2_away_hw: number; home_total_hw: number; away_total_hw: number; is_draw: boolean }

// This is the repository's existing course catalog. The inputs intentionally
// permit exact typed names because the repository does not contain a proven,
// complete authoritative list of every available PYP map.
const COURSE_SUGGESTIONS = ["Atlantis", "Bogey's Bonanza", "Cherry Blossom", "El Dorado", "Ice Lair", "Journey To The Center Of The Earth", "Labyrinth", "Laser Lair", "Meow Wolf", "Myst", "Quixote Valley", "Shangri-La", "Sweetopia", "Temple At Zerzura", "The Upside Town", "Tethys Station", "Wallace & Gromit", "Venice", "Viva Las Elvis", "Blokhaven"]

export default function PypResultsPage() {
  const router = useRouter()
  const [seasonId, setSeasonId] = useState("")
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [course1, setCourse1] = useState("")
  const [course2, setCourse2] = useState("")
  const [difficulty1, setDifficulty1] = useState<Difficulty>("")
  const [difficulty2, setDifficulty2] = useState<Difficulty>("")
  const [c1Home, setC1Home] = useState("")
  const [c1Away, setC1Away] = useState("")
  const [c2Home, setC2Home] = useState("")
  const [c2Away, setC2Away] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (id: string) => {
    setLoading(true)
    const [{ data: fixtureData, error: fixtureError }, { data: resultData, error: resultError }] = await Promise.all([
      supabase.from("schedule").select("id,division_number,game_number,pyp_home_player_screen_name,pyp_away_player_screen_name").eq("league_type", "pyp").eq("season_id", id).not("pyp_roster_version_id", "is", null).order("division_number").order("game_number"),
      supabase.from("pyp_managed_results").select("id,schedule_id,course1_name,course1_difficulty,course1_home_hw,course1_away_hw,course2_name,course2_difficulty,course2_home_hw,course2_away_hw,home_total_hw,away_total_hw,is_draw").eq("season_id", id),
    ])
    setLoading(false)
    if (fixtureError || resultError) {
      setMessage(fixtureError?.message || resultError?.message || "Could not load PYP fixtures.")
      return
    }
    setFixtures((fixtureData || []) as Fixture[])
    setResults((resultData || []) as Result[])
  }, [])

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("seasonId") || ""
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeasonId(id)
    if (id) void load(id)
    else { setMessage("A managed seasonId is required."); setLoading(false) }
  }, [load])

  const resultMap = useMemo(() => new Map(results.map((result) => [result.schedule_id, result])), [results])
  const fixture = fixtures.find((item) => item.id === selectedId)
  const existing = selectedId ? resultMap.get(selectedId) : undefined

  function selectFixture(id: string) {
    setSelectedId(id)
    setMessage("")
    const result = resultMap.get(id)
    setCourse1(result?.course1_name || "")
    setCourse2(result?.course2_name || "")
    setDifficulty1(result?.course1_difficulty || "")
    setDifficulty2(result?.course2_difficulty || "")
    setC1Home(result ? String(result.course1_home_hw) : "")
    setC1Away(result ? String(result.course1_away_hw) : "")
    setC2Home(result ? String(result.course2_home_hw) : "")
    setC2Away(result ? String(result.course2_away_hw) : "")
  }

  function parseHw(value: string, label: string) {
    if (value.trim() === "") throw new Error(`${label} is required.`)
    const number = Number(value)
    if (!Number.isInteger(number) || number < 0) throw new Error(`${label} must be a whole number of zero or greater.`)
    return number
  }

  async function save() {
    if (!fixture) return
    try {
      if (!course1.trim() || !course2.trim()) throw new Error("Both course names are required.")
      if (!difficulty1 || !difficulty2) throw new Error("Choose Easy or Hard for both courses.")
      const course1Home = parseHw(c1Home, `Course 1 ${fixture.pyp_home_player_screen_name} HW`)
      const course1Away = parseHw(c1Away, `Course 1 ${fixture.pyp_away_player_screen_name} HW`)
      const course2Home = parseHw(c2Home, `Course 2 ${fixture.pyp_home_player_screen_name} HW`)
      const course2Away = parseHw(c2Away, `Course 2 ${fixture.pyp_away_player_screen_name} HW`)
      setBusy(true)
      setMessage("")
      const { error } = await supabase.rpc("save_pyp_result", {
        p_schedule_id: fixture.id,
        p_course1_name: course1,
        p_course1_difficulty: difficulty1,
        p_course1_home_hw: course1Home,
        p_course1_away_hw: course1Away,
        p_course2_name: course2,
        p_course2_difficulty: difficulty2,
        p_course2_home_hw: course2Home,
        p_course2_away_hw: course2Away,
      })
      if (error) { setBusy(false); setMessage(error.message); return }
      const { error: standingsError } = await supabase.rpc("rebuild_pyp_standings", { p_season_id: seasonId, p_division_number: fixture.division_number })
      setBusy(false)
      if (standingsError) {
        setMessage(`Result saved, but standings rebuild failed: ${standingsError.message}`)
        await load(seasonId)
        return
      }
      setMessage("PYP result saved and standings rebuilt.")
      await load(seasonId)
    } catch (error) {
      setBusy(false)
      setMessage(error instanceof Error ? error.message : "Invalid result values.")
    }
  }

  async function remove() {
    if (!fixture || !existing || !window.confirm("Delete this saved PYP result?")) return
    setBusy(true)
    setMessage("")
    const { error } = await supabase.rpc("delete_pyp_result", { p_schedule_id: fixture.id })
    setBusy(false)
    if (error) { setMessage(error.message); return }
    setMessage("PYP result deleted and standings rebuilt.")
    setResults((current) => current.filter((result) => result.schedule_id !== fixture.id))
    setCourse1("")
    setCourse2("")
    setDifficulty1("")
    setDifficulty2("")
    setC1Home("")
    setC1Away("")
    setC2Home("")
    setC2Away("")
    await load(seasonId)
  }

  const values = [c1Home, c1Away, c2Home, c2Away].map((value) => value.trim() === "" ? null : Number(value))
  const homeTotal = values[0] === null || values[2] === null ? null : values[0] + values[2]
  const awayTotal = values[1] === null || values[3] === null ? null : values[1] + values[3]
  const outcome = homeTotal === null || awayTotal === null ? "Enter all four HW values" : homeTotal > awayTotal ? `${fixture?.pyp_home_player_screen_name || "Home"} Win` : awayTotal > homeTotal ? `${fixture?.pyp_away_player_screen_name || "Away"} Win` : "Draw"

  return <main style={page}><div style={container}><nav style={nav}><button onClick={() => router.push("/admin/pyp")}>← PYP Hub</button><button onClick={() => router.push(`/admin/pyp/schedule?seasonId=${encodeURIComponent(seasonId)}`)} disabled={!seasonId}>Schedule &amp; Images</button><button onClick={() => router.push(`/admin/pyp/standings?seasonId=${encodeURIComponent(seasonId)}`)} disabled={!seasonId}>Scorecard / Standings</button></nav><h1>PYP Results Admin</h1><p style={muted}>Enter each player&apos;s HW by name. Course 2 is displayed Away first because Away chooses it and Home hits first.</p>{loading ? <p>Loading fixtures...</p> : <div style={layout}><section style={panel}><h2>Managed Fixtures</h2>{fixtures.map((item) => <button key={item.id} onClick={() => selectFixture(item.id)} style={item.id === selectedId ? selectedFixture : fixtureButton}>D{item.division_number} · Round {item.game_number}<span>{item.pyp_home_player_screen_name} vs {item.pyp_away_player_screen_name}</span><small>{resultMap.has(item.id) ? "Result saved" : "Not played"}</small></button>)}</section>{fixture && <section style={panel}><h2>HOME · {fixture.pyp_home_player_screen_name} <span style={muted}>vs</span> AWAY · {fixture.pyp_away_player_screen_name}</h2><CourseEditor title="Course 1" instruction="Home Chooses / Away Hits First" course={course1} setCourse={setCourse1} difficulty={difficulty1} setDifficulty={setDifficulty1} firstName={fixture.pyp_home_player_screen_name} firstRole="HOME" firstScore={c1Home} setFirstScore={setC1Home} secondName={fixture.pyp_away_player_screen_name} secondRole="AWAY" secondScore={c1Away} setSecondScore={setC1Away} /><CourseEditor title="Course 2" instruction="Away Chooses / Home Hits First" course={course2} setCourse={setCourse2} difficulty={difficulty2} setDifficulty={setDifficulty2} firstName={fixture.pyp_away_player_screen_name} firstRole="AWAY" firstScore={c2Away} setFirstScore={setC2Away} secondName={fixture.pyp_home_player_screen_name} secondRole="HOME" secondScore={c2Home} setSecondScore={setC2Home} /><div style={totals}><strong>{fixture.pyp_home_player_screen_name} Total HW: {homeTotal ?? "—"}</strong><strong>{fixture.pyp_away_player_screen_name} Total HW: {awayTotal ?? "—"}</strong><strong>{outcome}</strong></div><div style={nav}><button disabled={busy} onClick={save} style={primary}>{busy ? "Saving..." : existing ? "Save Result Correction" : "Save Result"}</button>{existing && <button disabled={busy} onClick={remove} style={danger}>Delete Result</button>}</div></section>}</div>}{message && <p style={feedback}>{message}</p>}<datalist id="pyp-course-suggestions">{COURSE_SUGGESTIONS.map((name) => <option key={name} value={name} />)}</datalist></div></main>
}

function CourseEditor({ title, instruction, course, setCourse, difficulty, setDifficulty, firstName, firstRole, firstScore, setFirstScore, secondName, secondRole, secondScore, setSecondScore }: { title: string; instruction: string; course: string; setCourse: (value: string) => void; difficulty: Difficulty; setDifficulty: (value: Difficulty) => void; firstName: string; firstRole: string; firstScore: string; setFirstScore: (value: string) => void; secondName: string; secondRole: string; secondScore: string; setSecondScore: (value: string) => void }) {
  return <div style={courseCard}><h3>{title}</h3><p style={muted}>{instruction}</p><div style={courseGrid}><label style={field}>Course Name<input list="pyp-course-suggestions" value={course} onChange={(event) => setCourse(event.target.value)} placeholder="Enter exact course name" style={input} /></label><label style={field}>Difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)} style={input}><option value="">Choose difficulty</option><option value="Easy">Easy</option><option value="Hard">Hard</option></select></label></div><div style={scoreGrid}><label style={field}>{firstRole} · {firstName} HW<input type="number" min="0" step="1" value={firstScore} onChange={(event) => setFirstScore(event.target.value)} style={input} /></label><label style={field}>{secondRole} · {secondName} HW<input type="number" min="0" step="1" value={secondScore} onChange={(event) => setSecondScore(event.target.value)} style={input} /></label></div></div>
}

const page: React.CSSProperties = { minHeight: "100vh", padding: 24, background: "black", color: "white" }
const container: React.CSSProperties = { maxWidth: 1150, margin: "0 auto" }
const nav: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", margin: "16px 0" }
const muted: React.CSSProperties = { color: "#aaa" }
const layout: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(260px,.8fr) minmax(340px,1.5fr)", gap: 18 }
const panel: React.CSSProperties = { padding: 20, border: "1px solid #333", borderRadius: 14, background: "#0d0d0d" }
const fixtureButton: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, width: "100%", padding: 12, marginBottom: 8, textAlign: "left", background: "#151515", color: "white", border: "1px solid #333", borderRadius: 8 }
const selectedFixture: React.CSSProperties = { ...fixtureButton, borderColor: "#4ade80", background: "#10251a" }
const courseCard: React.CSSProperties = { padding: 16, marginTop: 14, border: "1px solid #333", borderRadius: 10, background: "#111" }
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 7, fontWeight: 700, minWidth: 0 }
const courseGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(130px,1fr)", gap: 12 }
const scoreGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginTop: 12 }
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: 10, background: "#111", color: "white", border: "1px solid #555", borderRadius: 8 }
const totals: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 18, padding: 16, marginTop: 16, borderRadius: 10, background: "#151515" }
const primary: React.CSSProperties = { padding: "11px 16px", background: "#126b3c", border: "1px solid #167a45", borderRadius: 8, color: "white", fontWeight: 800 }
const danger: React.CSSProperties = { ...primary, background: "#5f1d1d", borderColor: "#8b2c2c" }
const feedback: React.CSSProperties = { padding: 12, border: "1px solid #444", borderRadius: 8, background: "#171717" }
