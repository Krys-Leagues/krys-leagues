"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const LEAGUE_TYPE = "pyp"
const DIVISIONS = ["PYP D1", "PYP D2", "PYP D3", "PYP D4", "PYP D5"]

export default function PYPSchedulePage() {
  const [division, setDivision] = useState("PYP D1")
  const [season, setSeason] = useState("")
  const [dueDate, setDueDate] = useState("")

  const [players, setPlayers] = useState<string[]>([])

  const [p1, setP1] = useState("")
  const [p2, setP2] = useState("")
  const [p3, setP3] = useState("")
  const [p4, setP4] = useState("")

  const [course1, setCourse1] = useState("")
  const [course2, setCourse2] = useState("")
  const [course3, setCourse3] = useState("")

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadPlayers()
  }, [division])

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("screen_name")
      .eq("division", division)
      .order("screen_name", { ascending: true })

    if (error) {
      console.error(error)
      setPlayers([])
      return
    }

    setPlayers(data?.map((p: any) => p.screen_name) || [])
  }

  async function handleGenerateSeason() {
    const seasonNumber = Number(season)

    if (!seasonNumber || !dueDate) {
      alert("Enter season and due date")
      return
    }

    if (!p1 || !p2 || !p3 || !p4) {
      alert("Select all 4 players")
      return
    }

    if (!course1 || !course2 || !course3) {
      alert("Enter all courses")
      return
    }

    setLoading(true)

    await supabase.from("seasons").insert({
      league_type: LEAGUE_TYPE,
      division,
      season_number: seasonNumber,
      due_date: dueDate,
    })

    const matches = [
      { game: "1", player1: p1, player2: p2, course: course1 },
      { game: "1", player1: p3, player2: p4, course: course1 },
      { game: "2", player1: p1, player2: p3, course: course2 },
      { game: "2", player1: p2, player2: p4, course: course2 },
      { game: "3", player1: p1, player2: p4, course: course3 },
      { game: "3", player1: p2, player2: p3, course: course3 },
    ]

    await supabase.from("schedule").insert(
      matches.map((m) => ({
        league_type: LEAGUE_TYPE,
        division,
        season_number: seasonNumber,
        ...m,
      }))
    )

    setLoading(false)
    alert("PYP season created ✔")
  }

  return (
    <main style={{ padding: 24, background: "black", color: "white", minHeight: "100vh" }}>
      <h1>PYP Season Builder</h1>

      <input placeholder="Season" value={season} onChange={(e) => setSeason(e.target.value)} /><br /><br />
      <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /><br /><br />

      <input placeholder="P1" value={p1} onChange={(e) => setP1(e.target.value)} /><br />
      <input placeholder="P2" value={p2} onChange={(e) => setP2(e.target.value)} /><br />
      <input placeholder="P3" value={p3} onChange={(e) => setP3(e.target.value)} /><br />
      <input placeholder="P4" value={p4} onChange={(e) => setP4(e.target.value)} /><br /><br />

      <input placeholder="Course 1" value={course1} onChange={(e) => setCourse1(e.target.value)} /><br />
      <input placeholder="Course 2" value={course2} onChange={(e) => setCourse2(e.target.value)} /><br />
      <input placeholder="Course 3" value={course3} onChange={(e) => setCourse3(e.target.value)} /><br /><br />

      <button onClick={handleGenerateSeason} disabled={loading}>
        {loading ? "Creating..." : "Create Season"}
      </button>
    </main>
  )
}