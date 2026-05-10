"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Player = {
  id: string
  screen_name: string
}

type CombinedRecord = {
  id: string
  player_name: string
  course_name: string
  easy_score: number
  hard_score: number
  combined_score: number
  played_at: string | null
  notes: string | null
}

const COURSES = [
  "Atlantis",
  "Bogey's Bonanza",
  "Cherry Blossom",
  "El Dorado",
  "Ice Lair",
  "Journey To The Center Of The Earth",
  "Labyrinth",
  "Laser Lair",
  "Meow Wolf",
  "Myst",
  "Quixote Valley",
  "Shangri-La",
  "Sweetopia",
  "Temple At Zerzura",
  "The Upside Town",
  "Tethys Station",
  "Wallace & Gromit",
  "Venice",
  "Viva Las Elvis",
  "Blokhaven",
]

export default function CombinedRecordsPage() {
  const router = useRouter()

  const [players, setPlayers] = useState<Player[]>([])
  const [records, setRecords] = useState<CombinedRecord[]>([])

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [playerId, setPlayerId] = useState("")
  const [courseName, setCourseName] = useState(COURSES[0])

  const [easyScore, setEasyScore] = useState("")
  const [hardScore, setHardScore] = useState("")

  const [playedAt, setPlayedAt] = useState("")
  const [notes, setNotes] = useState("")

  const [courseFilter, setCourseFilter] = useState("ALL")

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)

    const { data: playerData } = await supabase
      .from("players")
      .select("id, screen_name")
      .order("screen_name", { ascending: true })

    const { data: recordData } = await supabase
      .from("combined_course_records")
      .select("*")
      .order("combined_score", { ascending: true })

    setPlayers(playerData || [])
    setRecords(recordData || [])

    setLoading(false)
  }

  const selectedPlayer = useMemo(() => {
    return players.find((p) => p.id === playerId) || null
  }, [players, playerId])

  const combinedScore = useMemo(() => {
    const easy = Number(easyScore)
    const hard = Number(hardScore)

    if (isNaN(easy) || isNaN(hard)) return null

    return easy + hard
  }, [easyScore, hardScore])

  async function saveRecord() {
    if (!selectedPlayer) {
      alert("Select player")
      return
    }

    if (!courseName) {
      alert("Select course")
      return
    }

    if (combinedScore === null) {
      alert("Enter valid scores")
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from("combined_course_records")
      .insert([
        {
          player_id: selectedPlayer.id,
          player_name: selectedPlayer.screen_name,
          course_name: courseName,
          easy_score: Number(easyScore),
          hard_score: Number(hardScore),
          combined_score: combinedScore,
          played_at: playedAt || null,
          notes: notes || null,
        },
      ])

    setSaving(false)

    if (error) {
      alert(error.message)
      return
    }

    setEasyScore("")
    setHardScore("")
    setNotes("")

    await loadData()

    alert("Combined record saved ✔")
  }

  const filteredRecords = useMemo(() => {
    if (courseFilter === "ALL") return records

    return records.filter((r) => r.course_name === courseFilter)
  }, [records, courseFilter])

  return (
    <main style={page}>
      <div style={topBar}>
        <button
          onClick={() => router.push("/admin")}
          style={backButton}
        >
          ← Admin
        </button>

        <button
          onClick={() => router.push("/admin/players")}
          style={backButton}
        >
          ← Players
        </button>
      </div>

      <h1 style={title}>Combined Course Records</h1>

      <p style={subtitle}>
        Easy + Hard combined all-time leaderboard records.
      </p>

      <div style={grid}>
        <div style={card}>
          <h2 style={sectionTitle}>Add Combined Record</h2>

          <label style={label}>Player</label>

          <select
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            style={input}
          >
            <option value="">Select Player</option>

            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.screen_name}
              </option>
            ))}
          </select>

          <label style={label}>Course</label>

          <select
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            style={input}
          >
            {COURSES.map((course) => (
              <option key={course}>{course}</option>
            ))}
          </select>

          <div style={scoreGrid}>
            <div>
              <label style={label}>Easy Score</label>

              <input
                value={easyScore}
                onChange={(e) => setEasyScore(e.target.value)}
                placeholder="-18"
                style={input}
              />
            </div>

            <div>
              <label style={label}>Hard Score</label>

              <input
                value={hardScore}
                onChange={(e) => setHardScore(e.target.value)}
                placeholder="-16"
                style={input}
              />
            </div>
          </div>

          <div style={combinedPreview}>
            Combined:
            <span style={combinedNumber}>
              {combinedScore !== null ? combinedScore : "--"}
            </span>
          </div>

          <label style={label}>Played Date</label>

          <input
            type="date"
            value={playedAt}
            onChange={(e) => setPlayedAt(e.target.value)}
            style={input}
          />

          <label style={label}>Notes</label>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Perfect double eagle run..."
            style={textarea}
          />

          <button
            onClick={saveRecord}
            disabled={saving || loading}
            style={saveButton}
          >
            {saving ? "Saving..." : "Save Combined Record"}
          </button>
        </div>

        <div style={card}>
          <div style={leaderboardTop}>
            <h2 style={sectionTitle}>Leaderboard</h2>

            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              style={filterSelect}
            >
              <option value="ALL">All Courses</option>

              {COURSES.map((course) => (
                <option key={course}>{course}</option>
              ))}
            </select>
          </div>

          <div style={recordsList}>
            {filteredRecords.map((record, index) => (
              <div key={record.id} style={recordCard}>
                <div style={placement}>
                  #{index + 1}
                </div>

                <div style={recordMain}>
                  <div style={recordPlayer}>
                    {record.player_name}
                  </div>

                  <div style={recordCourse}>
                    {record.course_name}
                  </div>

                  <div style={recordScores}>
                    Easy {record.easy_score} • Hard {record.hard_score}
                  </div>

                  {record.notes && (
                    <div style={recordNotes}>
                      {record.notes}
                    </div>
                  )}
                </div>

                <div style={combinedBox}>
                  {record.combined_score}
                </div>
              </div>
            ))}

            {!filteredRecords.length && (
              <div style={emptyState}>
                No combined records yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "black",
  color: "white",
  padding: 24,
}

const topBar: React.CSSProperties = {
  display: "flex",
  gap: 12,
  marginBottom: 20,
}

const backButton: React.CSSProperties = {
  background: "#222",
  border: "1px solid #555",
  color: "white",
  padding: "10px 14px",
  borderRadius: 8,
  cursor: "pointer",
}

const title: React.CSSProperties = {
  fontSize: 42,
  margin: 0,
}

const subtitle: React.CSSProperties = {
  color: "#aaa",
  marginTop: 8,
  marginBottom: 24,
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "420px 1fr",
  gap: 24,
}

const card: React.CSSProperties = {
  background: "#0a0a0a",
  border: "1px solid #333",
  borderRadius: 18,
  padding: 20,
}

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  fontSize: 28,
}

const label: React.CSSProperties = {
  display: "block",
  marginTop: 14,
  marginBottom: 6,
  color: "#ddd",
  fontWeight: 700,
}

const input: React.CSSProperties = {
  width: "100%",
  padding: 12,
  borderRadius: 8,
  border: "1px solid #444",
  background: "#050505",
  color: "white",
}

const textarea: React.CSSProperties = {
  width: "100%",
  minHeight: 90,
  padding: 12,
  borderRadius: 8,
  border: "1px solid #444",
  background: "#050505",
  color: "white",
  resize: "vertical",
}

const scoreGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  marginTop: 8,
}

const combinedPreview: React.CSSProperties = {
  marginTop: 18,
  fontSize: 24,
  fontWeight: 900,
}

const combinedNumber: React.CSSProperties = {
  marginLeft: 12,
  color: "#16a34a",
}

const saveButton: React.CSSProperties = {
  marginTop: 20,
  width: "100%",
  background: "#16a34a",
  border: "none",
  color: "white",
  padding: 16,
  borderRadius: 12,
  fontWeight: 900,
  fontSize: 18,
  cursor: "pointer",
}

const leaderboardTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
}

const filterSelect: React.CSSProperties = {
  background: "#050505",
  border: "1px solid #444",
  color: "white",
  padding: "10px 12px",
  borderRadius: 8,
}

const recordsList: React.CSSProperties = {
  marginTop: 18,
  display: "grid",
  gap: 12,
}

const recordCard: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "70px 1fr auto",
  gap: 16,
  alignItems: "center",
  padding: 16,
  borderRadius: 14,
  background: "#111",
  border: "1px solid #333",
}

const placement: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 900,
  color: "#aaa",
  textAlign: "center",
}

const recordMain: React.CSSProperties = {}

const recordPlayer: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
}

const recordCourse: React.CSSProperties = {
  color: "#60a5fa",
  marginTop: 4,
}

const recordScores: React.CSSProperties = {
  marginTop: 8,
  color: "#ddd",
}

const recordNotes: React.CSSProperties = {
  marginTop: 8,
  color: "#aaa",
  fontStyle: "italic",
}

const combinedBox: React.CSSProperties = {
  fontSize: 34,
  fontWeight: 900,
  color: "#16a34a",
}

const emptyState: React.CSSProperties = {
  padding: 24,
  textAlign: "center",
  color: "#777",
}