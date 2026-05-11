"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type SingleRecord = {
  id: string
  player_name: string
  course_name: string
  difficulty: string
  score: number
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

export default function SingleRecordsPage() {
  const router = useRouter()

  const [records, setRecords] = useState<SingleRecord[]>([])
  const [loading, setLoading] = useState(false)

  const [courseFilter, setCourseFilter] = useState("ALL")

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)

    const { data } = await supabase
      .from("single_course_records")
      .select("*")
      .order("course_name", { ascending: true })
      .order("difficulty", { ascending: true })
      .order("score", { ascending: true })

    setRecords(data || [])

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

  const filteredRecords = useMemo(() => {
    if (courseFilter === "ALL") return records

    return records.filter((r) => r.course_name === courseFilter)
  }, [records, courseFilter])

  const recordsByCourse = useMemo(() => {
    const grouped: Record<string, SingleRecord[]> = {}

    filteredRecords.forEach((record) => {
      if (!grouped[record.course_name]) {
        grouped[record.course_name] = []
      }

      grouped[record.course_name].push(record)
    })

    return grouped
  }, [filteredRecords])

  const coursesToShow = useMemo(() => {
    if (courseFilter !== "ALL") return [courseFilter]

    return COURSES.filter((course) => recordsByCourse[course]?.length)
  }, [courseFilter, recordsByCourse])

  function getDifficultyRecords(course: string, difficulty: string) {
    return (recordsByCourse[course] || [])
      .filter((r) => r.difficulty.toLowerCase() === difficulty.toLowerCase())
      .sort((a, b) => a.score - b.score)
  }

  return (
    <main style={page}>
      <div style={topBar}>
        <button onClick={() => router.push("/admin")} style={backButton}>
          ← Admin
        </button>

        <button
          onClick={() => router.push("/admin/records/combined")}
          style={backButton}
        >
          ← Combined Records
        </button>
      </div>

      <h1 style={title}>Single Course Records</h1>

      <p style={subtitle}>
        All-time Easy and Hard course leaderboards.
      </p>

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
          {coursesToShow.map((course) => {
            const easyRecords = getDifficultyRecords(course, "easy")
            const hardRecords = getDifficultyRecords(course, "hard")

            return (
              <div key={course} style={courseGroup}>
                <h3 style={courseHeader}>{course}</h3>

                <div style={difficultySection}>
                  <div style={difficultyTitle}>Easy</div>

                  {easyRecords.map((record, index) => (
                    <div key={record.id} style={recordCard}>
                      <div style={placement}>#{index + 1}</div>

                      <div style={recordMain}>
                        <div style={recordPlayer}>
                          {record.player_name}
                        </div>

                        <div style={recordMeta}>
                          {record.played_at && (
                            <span>{formatDate(record.played_at)}</span>
                          )}
                        </div>

                        {record.notes && (
                          <div style={recordNotes}>
                            {record.notes}
                          </div>
                        )}
                      </div>

                      <div style={scoreBox}>
                        {record.score}
                      </div>
                    </div>
                  ))}

                  {!easyRecords.length && (
                    <div style={emptyMini}>
                      No Easy records
                    </div>
                  )}
                </div>

                <div style={difficultySection}>
                  <div style={difficultyTitleHard}>Hard</div>

                  {hardRecords.map((record, index) => (
                    <div key={record.id} style={recordCard}>
                      <div style={placement}>#{index + 1}</div>

                      <div style={recordMain}>
                        <div style={recordPlayer}>
                          {record.player_name}
                        </div>

                        <div style={recordMeta}>
                          {record.played_at && (
                            <span>{formatDate(record.played_at)}</span>
                          )}
                        </div>

                        {record.notes && (
                          <div style={recordNotes}>
                            {record.notes}
                          </div>
                        )}
                      </div>

                      <div style={scoreBox}>
                        {record.score}
                      </div>
                    </div>
                  ))}

                  {!hardRecords.length && (
                    <div style={emptyMini}>
                      No Hard records
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {!filteredRecords.length && !loading && (
            <div style={emptyState}>
              No single records found.
            </div>
          )}
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

const card: React.CSSProperties = {
  background: "#0a0a0a",
  border: "1px solid #333",
  borderRadius: 18,
  padding: 20,
}

const leaderboardTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
}

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  fontSize: 28,
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
  gap: 24,
}

const courseGroup: React.CSSProperties = {
  display: "grid",
  gap: 18,
}

const courseHeader: React.CSSProperties = {
  fontSize: 30,
  margin: "8px 0",
  paddingBottom: 8,
  borderBottom: "1px solid #333",
  color: "#60a5fa",
}

const difficultySection: React.CSSProperties = {
  display: "grid",
  gap: 10,
}

const difficultyTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  color: "#16a34a",
}

const difficultyTitleHard: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  color: "#ef4444",
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

const recordMeta: React.CSSProperties = {
  marginTop: 8,
  color: "#aaa",
}

const recordNotes: React.CSSProperties = {
  marginTop: 8,
  color: "#777",
  fontStyle: "italic",
}

const scoreBox: React.CSSProperties = {
  fontSize: 34,
  fontWeight: 900,
  color: "#16a34a",
}

const emptyMini: React.CSSProperties = {
  color: "#666",
  paddingLeft: 12,
}

const emptyState: React.CSSProperties = {
  padding: 24,
  textAlign: "center",
  color: "#777",
}