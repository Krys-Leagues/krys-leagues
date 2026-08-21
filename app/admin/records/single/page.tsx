"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type SingleRecord = {
  id: string
  course_id: string
  course_code: string
  player_name: string
  historical_player_name: string
  identity_linked: boolean
  score: number
}

type AllTimeCourse = {
  id: string
  code: string
  display_name: string
  difficulty: "Easy" | "Hard"
}

type BestRecordRow = {
  id: string
  course_id: string
  score: number
  historical_player_name: string
  player: { screen_name: string } | Array<{ screen_name: string }> | null
}

type UnresolvedObservationRow = {
  id: string
  course_id: string
  score: number
  historical_player_name: string
}

export function competitiveRanks(records: Array<{ score: number }>) {
  return records.map((record, index) =>
    index > 0 && record.score === records[index - 1].score ? null : index + 1
  ).map((rank, index, ranks) => rank ?? ranks.slice(0, index).findLast((value) => value !== null) ?? 1)
}

export default function SingleRecordsPage() {
  const router = useRouter()

  const [records, setRecords] = useState<SingleRecord[]>([])
  const [courses, setCourses] = useState<AllTimeCourse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [courseFilter, setCourseFilter] = useState("ALL")

  async function loadData() {
    try {
      const [courseResult, bestResult, unresolvedResult] = await Promise.all([
        supabase.from("all_time_courses").select("id, code, display_name, difficulty").eq("active", true).in("difficulty", ["Easy", "Hard"]).order("display_name"),
        supabase.from("all_time_best_records").select("id, course_id, score, historical_player_name, player:players(screen_name)"),
        supabase.from("all_time_record_observations").select("id, course_id, score, historical_player_name").in("identity_status", ["unresolved", "ambiguous"]),
      ])
      if (courseResult.error) throw courseResult.error
      if (bestResult.error) throw bestResult.error
      if (unresolvedResult.error) throw unresolvedResult.error

      const catalog = (courseResult.data ?? []) as AllTimeCourse[]
      const byId = new Map(catalog.map((course) => [course.id, course]))
      const linked = ((bestResult.data ?? []) as BestRecordRow[]).flatMap((row) => {
        const course = byId.get(row.course_id)
        const player = Array.isArray(row.player) ? row.player[0] : row.player
        return course ? [{ id: row.id, course_id: course.id, course_code: course.code, player_name: player?.screen_name ?? row.historical_player_name, historical_player_name: row.historical_player_name, identity_linked: Boolean(player), score: row.score }] : []
      })
      const unresolvedBest = new Map<string, SingleRecord>()
      for (const row of (unresolvedResult.data ?? []) as UnresolvedObservationRow[]) {
        const course = byId.get(row.course_id)
        if (!course) continue
        const key = `${row.course_id}\u001f${row.historical_player_name}`
        const existing = unresolvedBest.get(key)
        if (!existing || row.score < existing.score) unresolvedBest.set(key, { id: row.id, course_id: course.id, course_code: course.code, player_name: row.historical_player_name, historical_player_name: row.historical_player_name, identity_linked: false, score: row.score })
      }
      setCourses(catalog)
      setRecords([...linked, ...unresolvedBest.values()])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "All-Time records could not be loaded.")
      setCourses([])
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadData(), 0)
    return () => window.clearTimeout(timeout)
  }, [])

  const filteredRecords = useMemo(() => {
    if (courseFilter === "ALL") return records

    return records.filter((r) => r.course_id === courseFilter)
  }, [records, courseFilter])

  const recordsByCourse = useMemo(() => {
    const grouped: Record<string, SingleRecord[]> = {}

    filteredRecords.forEach((record) => {
      if (!grouped[record.course_id]) {
        grouped[record.course_id] = []
      }

      grouped[record.course_id].push(record)
    })

    return grouped
  }, [filteredRecords])

  const coursesToShow = useMemo(() => {
    if (courseFilter !== "ALL") return courses.filter((course) => course.id === courseFilter)
    return courses.filter((course) => recordsByCourse[course.id]?.length)
  }, [courseFilter, courses, recordsByCourse])

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

            {courses.map((course) => (
              <option key={course.id} value={course.id}>{course.code} — {course.display_name}</option>
            ))}
          </select>
        </div>

        <div style={recordsList}>
          {coursesToShow.map((course) => {
            const courseRecords = (recordsByCourse[course.id] || []).sort((a, b) => a.score - b.score || a.player_name.localeCompare(b.player_name))
            const ranks = competitiveRanks(courseRecords)

            return (
              <div key={course.id} style={courseGroup}>
                <h3 style={courseHeader}>{course.display_name} — {course.code}</h3>

                <div style={difficultySection}>
                  <div style={course.difficulty === "Easy" ? difficultyTitle : difficultyTitleHard}>{course.difficulty} · {courseRecords.length} records</div>

                  {courseRecords.map((record, index) => (
                    <div key={record.id} style={recordCard}>
                      <div style={placement}>#{ranks[index]}</div>

                      <div style={recordMain}>
                        <div style={recordPlayer}>
                          {record.player_name}
                        </div>

                        <div style={recordMeta}>{record.identity_linked ? `Historical source: ${record.historical_player_name}` : "Unresolved historical identity"}</div>
                      </div>

                      <div style={scoreBox}>
                        {record.score}
                      </div>
                    </div>
                  ))}

                  {!courseRecords.length && (
                    <div style={emptyMini}>
                      No {course.difficulty} records
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
          {error && <div style={emptyState}>{error}</div>}
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
