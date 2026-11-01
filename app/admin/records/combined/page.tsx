"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AdminRecordsHero, AdminRecordsShell, adminRecordsStyles as styles } from "@/components/admin/records/AdminRecordsUI"
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
      .eq("active", true)
      .order("screen_name", { ascending: true })

    const { data: recordData } = await supabase
      .from("combined_course_records")
      .select("*")
      .order("course_name", { ascending: true })
      .order("combined_score", { ascending: true })

    setPlayers(playerData || [])
    setRecords(recordData || [])

    setLoading(false)
  }

  function formatDate(value: string | null) {
    if (!value) return ""

    const date = new Date(`${value}T00:00:00`)
    const month = date.getMonth() + 1
    const day = date.getDate()
    const year = String(date.getFullYear()).slice(-2)

    return `${month}/${day}/${year}`
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
      .upsert(
        [
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
        ],
        {
          onConflict: "player_name,course_name",
        }
      )

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

  const recordsByCourse = useMemo(() => {
    const grouped: Record<string, CombinedRecord[]> = {}

    filteredRecords.forEach((record) => {
      if (!grouped[record.course_name]) {
        grouped[record.course_name] = []
      }

      grouped[record.course_name].push(record)
    })

    Object.keys(grouped).forEach((course) => {
      grouped[course].sort((a, b) => a.combined_score - b.combined_score)
    })

    return grouped
  }, [filteredRecords])

  const coursesToShow = useMemo(() => {
    if (courseFilter !== "ALL") return [courseFilter]

    return COURSES.filter((course) => recordsByCourse[course]?.length)
  }, [courseFilter, recordsByCourse])

  return (
    <AdminRecordsShell>
      <div className={styles.nav}>
        <button onClick={() => router.push("/admin/records")} className={styles.button}>← Records hub</button>
        <button onClick={() => router.push("/admin/players")} className={styles.button}>Players</button>
      </div>
      <AdminRecordsHero title="Combined Course Records" description="Manage and review the existing Easy + Hard combined leaderboard workspace." />

      <div className={styles.gridTwo}>
        <section className={`${styles.glass} ${styles.cardPadding}`}>
          <h2 className={styles.sectionHeading}>Add Combined Record</h2>

          <label style={label}>Player</label>

          <select
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            className={styles.select}
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
            className={styles.select}
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
                className={styles.input}
              />
            </div>

            <div>
              <label style={label}>Hard Score</label>

              <input
                value={hardScore}
                onChange={(e) => setHardScore(e.target.value)}
                placeholder="-16"
                className={styles.input}
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
            className={styles.input}
          />

          <label style={label}>Notes</label>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Perfect double eagle run..."
            className={styles.textarea}
          />

          <button
            onClick={saveRecord}
            disabled={saving || loading}
            className={styles.buttonSuccess}
          >
            {saving ? "Saving..." : "Save Combined Record"}
          </button>
        </section>

        <section className={`${styles.glass} ${styles.cardPadding}`}>
          <div className={styles.toolbar}>
            <h2 className={styles.sectionHeading}>Leaderboard</h2>

            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className={styles.select}
            >
              <option value="ALL">All Courses</option>

              {COURSES.map((course) => (
                <option key={course}>{course}</option>
              ))}
            </select>
          </div>

          <div className={styles.recordList}>
            {coursesToShow.map((course) => (
              <div key={course} className={styles.stack}>
                <h3 className={styles.sectionHeading}>{course}</h3>

                {(recordsByCourse[course] || []).map((record, index) => (
                  <div key={record.id} className={styles.recordRow}>
                    <div className={styles.rank}>#{index + 1}</div>

                    <div>
                      <div className={styles.player}>{record.player_name}</div>

                      <div className={styles.meta}>
                        Easy {record.easy_score} • Hard {record.hard_score}
                        {record.played_at && (
                          <span style={dateText}> • {formatDate(record.played_at)}</span>
                        )}
                      </div>

                      {record.notes && (
                        <div className={styles.meta}>{record.notes}</div>
                      )}
                    </div>

                    <div className={styles.score}>{record.combined_score}</div>
                  </div>
                ))}
              </div>
            ))}

            {!filteredRecords.length && (
              <div className={styles.empty}>No combined records yet.</div>
            )}
          </div>
        </section>
      </div>
    </AdminRecordsShell>
  )
}

const label: React.CSSProperties = {
  display: "block",
  marginTop: 14,
  marginBottom: 6,
  color: "#ddd",
  fontWeight: 700,
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

const dateText: React.CSSProperties = {
  color: "#aaa",
}
